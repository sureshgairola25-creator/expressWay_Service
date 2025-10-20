const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../db/models');
const { Conflict, Unauthorized, BadRequest } = require('http-errors');
const { OAuth2Client } = require('google-auth-library');

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
    });

    return newUser;
  },

  loginUser: async (loginData) => {
    const { email, password } = loginData;

    // Find user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw new Unauthorized('Invalid credentials');
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
};

module.exports = userService;
