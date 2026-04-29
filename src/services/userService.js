const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sequelize } = require('../db/database');
const { User, Booking, Review, Trip, Car, Location } = require('../db/models');
const { Conflict, Unauthorized, BadRequest, NotFound } = require('http-errors');
const { OAuth2Client } = require('google-auth-library');
const { sendEmail } = require('../lib/email');
const { sendSMS } = require('../lib/sms');
const { calculateDuration } = require('../utils/dateUtils');
const { Op } = require('sequelize');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ── Access token (short-lived, stateless) ────────────────────────────────────
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role || 'user' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m' }
  );
};

// ── Refresh token (long-lived, stored in DB for revocation) ──────────────────
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const storeRefreshToken = async (userId, token) => {
  const { RefreshToken } = require('../db/models');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  // Purge old revoked tokens for this user (housekeeping)
  await RefreshToken.destroy({ where: { userId, isRevoked: true } });
  return RefreshToken.create({ userId, token, expiresAt });
};

// ── In-memory blacklist for immediate access-token revocation on logout ───────
// Acceptable for a single-server deployment; tokens expire in 15m anyway.
const tokenBlacklist = new Set();

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
    const refreshToken = generateRefreshToken(user.id);
    await storeRefreshToken(user.id, refreshToken);
    user.password = undefined;
    return { token, refreshToken, user };
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
    const refreshToken = generateRefreshToken(user.id);
    await storeRefreshToken(user.id, refreshToken);
    user.password = undefined;
    return { token, refreshToken, user };
  },

  updateProfile: async (userId, updateData) => {
    const { firstName, lastName, phoneNo, email, gender, ageRange } = updateData;

    const user = await User.findByPk(userId);
    if (!user) {
      throw new NotFound('User not found');
    }

    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.phoneNo = phoneNo || user.phoneNo;
    user.email = email || user.email;
    user.gender = gender || user.gender;
    user.ageRange = ageRange || user.ageRange;


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

  getAllUsers: async ({ page = 1, limit = 10 } = {}) => {
    const parsedPage  = parseInt(page,  10);
    const parsedLimit = parseInt(limit, 10);
    const offset      = (parsedPage - 1) * parsedLimit;

    const { count, rows } = await User.findAndCountAll({
      where:  { isVerified: true, role: 'user' },
      limit:  parsedLimit,
      offset,
      order:  [['created_at', 'DESC']],
    });

    return {
      data: rows,
      pagination: {
        total:      count,
        page:       parsedPage,
        limit:      parsedLimit,
        totalPages: Math.ceil(count / parsedLimit),
      },
    };
  },

  // ─────────────────────────────────────────────────────────────────────────────
// BACKEND FIX — userService.js
// Replace your current getUserRides with this
// Fixes:
// 1. Was only fetching bookingStatus:"confirmed" — now fetches all statuses
// 2. Adds isUpcoming flag so frontend can split correctly
// 3. Handles personalize bookings (no pickupPoint/dropPoint)
// ─────────────────────────────────────────────────────────────────────────────

getUserRides: async (userId, { page = 1, limit = 10 } = {}) => {
  const {
    Trip, Booking, Car, StartLocation, EndLocation, PickupPoint, DropPoint,
  } = require('../db/models');

  const offset = (page - 1) * limit;

  try {
    const { count, rows: bookings } = await Booking.findAndCountAll({
      where: {
        userId,
       bookingStatus: { [Op.ne]: 'expired' }
      },
      include: [
        {
          model: Trip,
          as: 'trip',
          include: [
            { model: Car,           as: 'car'           },
            { model: StartLocation, as: 'startLocation' },
            { model: EndLocation,   as: 'endLocation'   },
          ],
        },
        { model: PickupPoint, as: 'pickupPoint', required: false },
        { model: DropPoint,   as: 'dropPoint',   required: false },
      ],
      order:  [['id', 'DESC']],
      // offset,
      // limit: parseInt(limit, 10),
    });

    // ── Reviews ───────────────────────────────────────────────────────────────
    const bookingIds = bookings.map(b => b.id);
    let reviewMap = new Map();

    if (bookingIds.length > 0) {
      const reviews = await sequelize.query(
        'SELECT id, booking_id, rating, feedback FROM Reviews WHERE booking_id IN (?)',
        { replacements: [bookingIds], type: sequelize.QueryTypes.SELECT }
      );
      reviews.forEach(r => {
        reviewMap.set(r.booking_id, { id: r.id, rating: r.rating, feedback: r.feedback });
      });
    }

    // ── Today's date string for upcoming/past split ───────────────────────────
    // Use YYYY-MM-DD string comparison to avoid timezone issues
    // journeyDate is stored as DATEONLY ("2026-03-27") in DB
    const todayStr = new Date().toISOString().split('T')[0]; // "2026-03-27"

    // ── Format each booking ───────────────────────────────────────────────────
    const formatRide = (booking) => {
      const trip      = booking.trip;
      const startTime = new Date(trip.startTime);

      // Map booking status
      // let status = 'Confirmed';
      // if (booking.bookingStatus === 'cancelled')  status = 'Cancelled';
      // if (booking.bookingStatus === 'completed')  status = 'Completed';
      // if (booking.bookingStatus === 'initiated' && booking.paymentStatus === 'pending') status = 'Pending';
      // ✅ FIX — har possible bookingStatus explicitly handle karo
let status;
switch (booking.bookingStatus) {
  case 'confirmed':
    status = 'Confirmed';
    break;
  case 'cancelled':
    status = 'Cancelled';
    break;
  case 'completed':
    status = 'Completed';
    break;
  case 'initiated':
    // Payment ho gaya but webhook abhi nahi aaya → still show as Pending
    // Payment nahi hua → Pending
    status = 'Pending';
    break;
  case 'failed':
    status = 'Failed';
    break;
  default:
    status = booking.bookingStatus || 'Unknown';
}

      // journeyDate from DB: "2026-03-27" (DATEONLY)
      const journeyDateStr = booking.journeyDate
        ? (typeof booking.journeyDate === 'string'
            ? booking.journeyDate.split('T')[0]
            : new Date(booking.journeyDate).toISOString().split('T')[0])
        : todayStr;

      // ✅ FIX 2: String comparison — avoids timezone issues entirely
      // const isUpcoming = journeyDateStr >= todayStr && status !== 'Cancelled';
      const isUpcoming = journeyDateStr >= todayStr
  && status !== 'Cancelled'
  && status !== 'Pending'    // ← payment incomplete
  && status !== 'Failed';

      // Reviews
      const review        = reviewMap.get(booking.id);
      const hasReview     = !!review;
      const canReview     = (status === 'Confirmed' || status === 'Completed') && !hasReview;

      // ✅ FIX 3: Handle personalize bookings — pickupPoint/dropPoint may be null
      // For personalize: pickup/drop address stored in priceBreakdown
      const pickupName = booking.pickupPoint?.name
        || booking.priceBreakdown?.pickupAddress
        || trip.startLocation?.name
        || 'Pickup';

      const dropName = booking.dropPoint?.name
        || booking.priceBreakdown?.dropAddress
        || trip.endLocation?.name
        || 'Drop';

      return {
        id:            booking.id,
        bookingId:     booking.bookingId,
        bookingType:   booking.bookingType || 'sharing',
        status,
        isUpcoming,                                  // ← frontend uses this to split
        journeyDate:   journeyDateStr,               // clean YYYY-MM-DD string
        journeyTime:   booking.journeyTime || null,
        cabType:       `${trip.car?.carName || ''}-${trip.car?.carUniqueNumber || ''}`,
        date:          startTime.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        time:          startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        startLocation: trip.startLocation?.name || 'Start',
        endLocation:   trip.endLocation?.name   || 'End',
        duration:      calculateDuration(startTime, trip.endTime),
        pickup:        pickupName,
        dropoff:       dropName,
        fare:               parseFloat(booking.totalAmount || 0),
        totalAmount:        parseFloat(booking.totalAmount || 0),
        paidAmount:         parseFloat(booking.paidAmount  || 0),
        remainingAmount:    parseFloat(booking.remainingAmount || 0),
        paymentMode:        booking.paymentMode    || 'full',
        paymentStatus:      booking.paymentStatus  || null,
        priceBreakdown:     booking.priceBreakdown || null,
        seats:              booking.seats,
        cabinNumber:        booking.cabinNumber    || null,
        passengerCount:     booking.passengerCount || null,
        passengers:         booking.passengers     || [],
        carName:            trip.car?.carName          || null,
        vehicleCategory:    trip.car?.vehicleCategory  || null,
        registrationNumber: trip.car?.registrationNumber || null,
        hasReview,
        canReview,
        reviewRating:  hasReview ? review.rating   : null,
        reviewFeedback:hasReview ? review.feedback : null,
      };
    };

    const rides = bookings.map(formatRide);

    return {
      success: true,
      total:   count,
      page,
      limit:   parseInt(limit, 10),
      rides,
    };
  } catch (error) {
    console.error('Error in getUserRides:', error);
    throw error;
  }
},
// ─────────────────────────────────────────────────────────────────────────────
// ADD THESE THREE FUNCTIONS to your existing userService object
// Place them before the closing }; of userService
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. Forgot Password — sends OTP to email or mobile ─────────────────────────
 forgotPassword: async (identifier) => {
  if (!identifier || !identifier.trim()) {
    throw new BadRequest('Email or mobile number is required');
  }

  const isEmail  = identifier.includes('@');
  // const isMobile = !isEmail && /^\+?\d{10,13}$/.test(identifier.replace(/\s/g, ''));
  const normalizedIdentifier = normalizeIdentifier(identifier);


  if (!isEmail && !normalizedIdentifier) {
    throw new BadRequest('Please provide a valid email or 10-digit mobile number');
  }

  // Find user
  const user = await User.findOne({
    where: isEmail
      ? { email: identifier.trim() }
      : { phoneNo: normalizedIdentifier.trim() },
  });

  // ✅ 404 if not found
  if (!user) {
    throw new NotFound('No account found with this email or mobile number. Please register first.');
  }

  if (!user.isVerified) {
    throw new BadRequest('Account not verified. Please complete your registration first.');
  }

  // Generate 6-digit OTP
  const otp        = Math.floor(100000 + Math.random() * 900000).toString();
  const expiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Store OTP on user record (reuse token/tokenExpiration columns)
  user.token           = otp;
  user.tokenExpiration = expiration;
  await user.save();

  // Send OTP
  if (isEmail) {
    await sendEmail(
      identifier.trim(),
      'ExpressWay Cab — Password Reset OTP',
      `Your password reset OTP is: ${otp}\n\nThis OTP is valid for 10 minutes. Do not share it with anyone.`
    );
  } else {
    await sendSMS(identifier.trim(), { otp });
  }

  return {
    success: true,
    message: `OTP sent to your ${isEmail ? 'email' : 'mobile number'} successfully.`,
  };
},

// ── 2. Verify Reset OTP — validates OTP without resetting password ─────────────
verifyResetOtp: async (identifier, otp) => {
  if (!identifier || !otp) {
    throw new BadRequest('Identifier and OTP are required');
  }

  const isEmail = identifier.includes('@');
  const normalizedIdentifier = normalizeIdentifier(identifier);


  const user = await User.findOne({
    where: isEmail
      ? { email: identifier.trim() }
      : { phoneNo: normalizedIdentifier.trim() },
  });

  if (!user) {
    throw new NotFound('No account found with this email or mobile number.');
  }

  // ✅ 400 for wrong/expired OTP
  if (!user.token || user.token !== otp.toString()) {
    throw new BadRequest('Invalid OTP. Please enter the correct OTP.');
  }

  if (new Date() > user.tokenExpiration) {
    throw new BadRequest('OTP has expired. Please request a new one.');
  }

  return {
    success: true,
    message: 'OTP verified successfully.',
  };
},

// ── 3. Reset Password — verifies OTP again then updates password ──────────────
 resetPassword:async (identifier, otp, newPassword) => {
  if (!identifier || !otp || !newPassword) {
    throw new BadRequest('Identifier, OTP, and new password are required');
  }

  if (newPassword.length < 6) {
    throw new BadRequest('Password must be at least 6 characters long');
  }

  const isEmail = identifier.includes('@');
  const normalizedIdentifier = normalizeIdentifier(identifier);


  const user = await User.findOne({
    where: isEmail
      ? { email: identifier.trim() }
      : { phoneNo: normalizedIdentifier.trim() },
  });

  if (!user) {
    throw new NotFound('No account found with this email or mobile number.');
  }

  // Verify OTP one more time
  if (!user.token || user.token !== otp.toString()) {
    throw new BadRequest('Invalid OTP. Session may have expired — please start over.');
  }

  if (new Date() > user.tokenExpiration) {
    throw new BadRequest('OTP has expired. Please request a new one.');
  }

  // Hash and update password
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  user.password        = hashedPassword;
  user.token           = null;      // clear OTP after successful reset
  user.tokenExpiration = null;
  await user.save();

  return {
    success: true,
    message: 'Password reset successfully. You can now log in with your new password.',
  };
},

  // ── Logout: blacklist access token + revoke refresh token in DB ──────────────
  logout: async (accessToken, refreshToken) => {
    if (accessToken) tokenBlacklist.add(accessToken);
    if (refreshToken) {
      const { RefreshToken } = require('../db/models');
      await RefreshToken.update({ isRevoked: true }, { where: { token: refreshToken } });
    }
    return { success: true, message: 'Logged out successfully' };
  },

  // ── Refresh: issue new access token using a valid refresh token ───────────────
  refreshAccessToken: async (refreshTokenStr) => {
    if (!refreshTokenStr) throw new BadRequest('Refresh token required');

    let decoded;
    try {
      decoded = jwt.verify(
        refreshTokenStr,
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
      );
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new Unauthorized('Refresh token expired — please log in again');
      }
      throw new Unauthorized('Invalid refresh token');
    }

    const { RefreshToken } = require('../db/models');
    const stored = await RefreshToken.findOne({
      where: { token: refreshTokenStr, userId: decoded.id, isRevoked: false }
    });
    if (!stored) throw new Unauthorized('Refresh token not found or already revoked');
    if (new Date() > new Date(stored.expiresAt)) {
      throw new Unauthorized('Refresh token expired — please log in again');
    }

    const user = await User.findByPk(decoded.id);
    if (!user) throw new Unauthorized('User not found');

    return { token: generateToken(user) };
  },

  // ── MOBILE APP AUTH ──────────────────────────────────────────────────────────
// Add these 3 methods inside the userService object

// ── 1. Send OTP (mobile only) ─────────────────────────────────────────────────
sendMobileOtp: async (phoneNo) => {
  if (!phoneNo || !/^\d{10}$/.test(phoneNo.trim())) {
    throw new BadRequest('Please provide a valid 10-digit mobile number');
  }

  const normalizedPhone = phoneNo.trim();
  const otp             = Math.floor(100000 + Math.random() * 900000).toString();
  const expiration      = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  let user = await User.findOne({ where: { phoneNo: normalizedPhone } });
  let isExistingUser = false;

  if (user) {
    // Existing user (verified or unverified) — update OTP
    isExistingUser = user.isVerified; // true only if fully registered
    user.token           = otp;
    user.tokenExpiration = expiration;
    await user.save();
  } else {
    // New user — create a stub record
    user = await User.create({
      phoneNo:         normalizedPhone,
      token:           otp,
      tokenExpiration: expiration,
    });
    isExistingUser = false;
  }
console.log(otp);

  await sendSMS(normalizedPhone, { otp });

  return {
    success: true,
    status:  isExistingUser ? 'existing_user' : 'new_user',
    message: 'OTP sent successfully',
  };
},

// ── 2. Verify OTP → issue 90-day auth token ────────────────────────────────────
verifyMobileOtp: async (phoneNo, otp) => {
  if (!phoneNo || !otp) {
    throw new BadRequest('Mobile number and OTP are required');
  }

  const normalizedPhone = phoneNo.trim();

  const user = await User.findOne({ where: { phoneNo: normalizedPhone } });

  if (!user) {
    throw new NotFound('No account found with this mobile number');
  }

  if (!user.token || user.token !== otp.toString()) {
    throw new BadRequest('Invalid OTP. Please enter the correct OTP.');
  }

  if (new Date() > user.tokenExpiration) {
    throw new BadRequest('OTP has expired. Please request a new one.');
  }

  // Mark verified, clear OTP
  user.isVerified      = true;
  user.token           = null;
  user.tokenExpiration = null;
  await user.save();

  // 90-day token — long-lived for mobile app
  const appToken = jwt.sign(
    { id: user.id, phoneNo: user.phoneNo, role: user.role || 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '90d' }
  );

  // Store as a refresh token for revocation support
  const { RefreshToken } = require('../db/models');
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  await RefreshToken.destroy({ where: { userId: user.id, isRevoked: true } }); // housekeeping
  await RefreshToken.create({ userId: user.id, token: appToken, expiresAt });

  user.password = undefined;

  return {
    success:    true,
    token:      appToken,
    expiresIn:  '90d',
    status:     user.firstName ? 'existing_user' : 'new_user', // app uses this to route to profile setup
    user,
  };
},

// ── 3. Validate Token (app launch check) ─────────────────────────────────────
validateAppToken: async (tokenStr) => {
  if (!tokenStr) {
    throw new BadRequest('Token is required');
  }

  // Check in-memory blacklist first (logout tokens)
  if (tokenBlacklist.has(tokenStr)) {
    return { valid: false, reason: 'Token has been revoked' };
  }

  let decoded;
  try {
    decoded = jwt.verify(tokenStr, process.env.JWT_SECRET);
  } catch (err) {
    return {
      valid:  false,
      reason: err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
    };
  }

  // Check DB — was it revoked (e.g., user logged out)?
  const { RefreshToken } = require('../db/models');
  const stored = await RefreshToken.findOne({
    where: { token: tokenStr, userId: decoded.id, isRevoked: false },
  });

  if (!stored) {
    return { valid: false, reason: 'Token has been revoked or not found' };
  }

  if (new Date() > new Date(stored.expiresAt)) {
    return { valid: false, reason: 'Token expired' };
  }

  return { valid: true };
},
// ── Resend OTP (mobile app) ────────────────────────────────────────────────────
resendMobileOtp: async (phoneNo) => {
  if (!phoneNo || !/^\d{10}$/.test(phoneNo.trim())) {
    throw new BadRequest('Please provide a valid 10-digit mobile number');
  }

  const normalizedPhone = phoneNo.trim();

  const user = await User.findOne({ where: { phoneNo: normalizedPhone } });

  if (!user) {
    throw new NotFound('No account found with this mobile number. Please initiate sign-up first.');
  }

  // ── Cooldown check: prevent OTP spam ─────────────────────────────────────────
  // If a valid (non-expired) OTP was sent less than 60 seconds ago → block resend
  const COOLDOWN_SECONDS = 60;
  if (user.tokenExpiration) {
    const otpCreatedAt  = new Date(user.tokenExpiration).getTime() - 10 * 60 * 1000; // expiry - 10min = when it was issued
    const secondsSince  = Math.floor((Date.now() - otpCreatedAt) / 1000);
    if (secondsSince < COOLDOWN_SECONDS) {
      throw new BadRequest(
        `Please wait ${COOLDOWN_SECONDS - secondsSince} seconds before requesting a new OTP.`
      );
    }
  }

  // Generate fresh OTP
  const otp        = Math.floor(100000 + Math.random() * 900000).toString();
  const expiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  user.token           = otp;
  user.tokenExpiration = expiration;
  await user.save();

  await sendSMS(normalizedPhone, { otp });

  return {
    success: true,
    message: 'OTP resent successfully',
  };
},
};
const normalizeIdentifier = (identifier) => {
  const isEmail = identifier.includes('@');
  if (isEmail) return identifier.trim();

  return identifier.trim()
    .replace(/\s/g, '')
    .replace(/^\+91/, '')
    .replace(/^91/, '');
};

module.exports = userService;
// Export tokenBlacklist so middleware/auth.js can check it on every request
module.exports.tokenBlacklist = tokenBlacklist;
