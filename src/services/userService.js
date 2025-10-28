const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../db/models');
const { Conflict, Unauthorized, BadRequest, NotFound } = require('http-errors');
const { OAuth2Client } = require('google-auth-library');
const { sendEmail } = require('../lib/email');
const { sendSMS } = require('../lib/sms');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateToken = (user) => {
  return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: '1d',
  });
};

const userService = {
  registerUser: async (userData) => {
    const { firstName, lastName, email, phoneNo, password } = userData;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new Conflict('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create new user
    const newUser = await User.create({
      firstName,
      lastName,
      email,
      phoneNo,
      password: hashedPassword,
      provider: 'manual',
      isVerified: true, // Users who register with password are considered verified
    });

    return newUser;
  },

  loginUser: async (loginData) => {

    const { identifier, password } = loginData;
    const isEmail = identifier.includes('@');
    const isMobile = !isEmail && /^\d+$/.test(identifier);

    // Find user by email or mobile no and ensure they are verified
    const user = await User.findOne({
      where: {
        [isEmail ? 'email' : 'phoneNo']: identifier,
        isVerified: true
      }
    });

    if (!user) {
      throw new Unauthorized('Invalid credentials');
    }

    // Check if user has a password set
    if (!user.password) {
      throw new Unauthorized('Please set your password first using /set-password endpoint');
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      throw new Unauthorized('Invalid credentials');
    }

    const token = generateToken(user);
    user.password = undefined; // Exclude password from response
    return { token, user };
  },

  googleLogin: async (idToken) => {
    if (!idToken) {
      throw new BadRequest('Google token is required');
    }

    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const { name, email, sub: googleId } = ticket.getPayload();
    const [firstName, lastName] = name.split(' ');

    let user = await User.findOne({ where: { email } });

    if (user) {
      // User exists, log them in
      if (user.provider !== 'google') {
        throw new Conflict('This email is registered with a manual password. Please log in manually.');
      }
    } else {
      // User does not exist, create a new user
      user = await User.create({
        firstName,
        lastName,
        email,
        provider: 'google',
        googleId,
        isVerified: true, // Google users are considered verified
      });
    }

    const token = generateToken(user);
    user.password = undefined; // Exclude password from response
    return { token, user };
  },

  updateProfile: async (userId, updateData) => {
    const { firstName, lastName, phoneNo } = updateData;

    const user = await User.findByPk(userId);
    if (!user) {
      throw new NotFound('User not found');
    }

    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.phoneNo = phoneNo || user.phoneNo;

    await user.save();
    user.password = undefined; // Exclude password from response
    return user;
  },

  signup: async (identifier) => {
    const isEmail = identifier.includes('@');
    const isMobile = !isEmail && /^\d+$/.test(identifier);
  
    if (!isEmail && !isMobile) {
      throw new BadRequest('Invalid identifier');
    }
  
    // Generate 6-digit numeric OTP
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
    let user = await User.findOne({
      where: isEmail ? { email: identifier } : { phoneNo: identifier },
    });
  
    if (user && user.isVerified) {
      throw new BadRequest('User already registered. Please login instead.');
    }
  
    if (user) {
      // Unverified user — update OTP and expiration
      user.token = token;
      user.tokenExpiration = expiration;
      await user.save();
    } else {
      // New user — create entry
      user = await User.create({
        [isEmail ? 'email' : 'phoneNo']: identifier,
        [isEmail ? 'phoneNo' : 'email']: null,
        token,
        tokenExpiration: expiration,
      });
    }
  
    if (isEmail) {
      await sendEmail(identifier, 'Verification Token', `Your verification token is ${token}`);
    } else {
      await sendSMS(identifier, { otp: token });
    }
  
    return {
      success: true,
      message: 'Token sent successfully',
      identifierType: isEmail ? 'email' : 'mobile',
    };
  },
  

  verify: async (identifier, token) => {
    let isEmail = identifier.includes('@');
    let user = await User.findOne({ where: isEmail ? { email: identifier } : { phoneNo: identifier } });

    if (!user || user.token !== token || new Date() > user.tokenExpiration) {
      throw new BadRequest('Invalid token');
    }

    user.isVerified = true;
    user.token = null;
    user.tokenExpiration = null;
    await user.save();

    return { success: true, message: 'User verified successfully', userId: user.id };
  },

  setPassword: async (identifier, password) => {
    let isEmail = identifier.includes('@');
    let user = await User.findOne({ where: isEmail ? { email: identifier } : { phoneNo: identifier } });

    if (!user) {
      throw new NotFound('User not found');
    }

    if (!user.isVerified) {
      throw new BadRequest('User must be verified before setting password');
    }

    if (user.password) {
      throw new Conflict('Password already set for this user');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update user with password
    user.password = hashedPassword;
    await user.save();

    return { success: true, message: 'Password set successfully' };
  },
};

module.exports = userService;
