const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sequelize } = require('../db/database');
const { User, Booking, Review, Trip, Car, Location } = require('../db/models');
const { Conflict, Unauthorized, BadRequest, NotFound } = require('http-errors');
const { OAuth2Client } = require('google-auth-library');
const { sendEmail } = require('../lib/email');
const { sendSMS } = require('../lib/sms');
const { calculateDuration } = require('../utils/dateUtils');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateToken = (user) => {
  return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: '1d',
  });
};

// In-memory token blacklist
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

  getAllUsers: async () => {
    return await User.findAll({where: {isVerified: true,role: 'user'}});
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
        // ✅ FIX 1: Include ALL booking statuses, not just "confirmed"
        // bookingStatus: "confirmed"  ← was wrong, removed
      },
      include: [
        {
          model: Trip,
          as: 'trip',
          include: [
            { model: Car,           as: 'Car'           },
            { model: StartLocation, as: 'startLocation' },
            { model: EndLocation,   as: 'endLocation'   },
          ],
        },
        { model: PickupPoint, as: 'pickupPoint', required: false },
        { model: DropPoint,   as: 'dropPoint',   required: false },
      ],
      order:  [['id', 'DESC']],
      offset,
      limit: parseInt(limit, 10),
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
      let status = 'Confirmed';
      if (booking.bookingStatus === 'cancelled')  status = 'Cancelled';
      if (booking.bookingStatus === 'completed')  status = 'Completed';
      if (booking.bookingStatus === 'initiated' && booking.paymentStatus === 'pending') status = 'Pending';

      // journeyDate from DB: "2026-03-27" (DATEONLY)
      const journeyDateStr = booking.journeyDate
        ? (typeof booking.journeyDate === 'string'
            ? booking.journeyDate.split('T')[0]
            : new Date(booking.journeyDate).toISOString().split('T')[0])
        : todayStr;

      // ✅ FIX 2: String comparison — avoids timezone issues entirely
      const isUpcoming = journeyDateStr >= todayStr && status !== 'Cancelled';

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
        cabType:       `${trip.Car?.carType || ''} (${trip.Car?.carName || ''}-${trip.Car?.carUniqueNumber || ''})`,
        date:          startTime.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        time:          startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        startLocation: trip.startLocation?.name || 'Start',
        endLocation:   trip.endLocation?.name   || 'End',
        duration:      calculateDuration(startTime, trip.endTime),
        pickup:        pickupName,
        dropoff:       dropName,
        fare:          parseFloat(booking.totalAmount || 0),
        seats:         booking.seats,
        passengerCount: booking.passengerCount || null,
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
};

module.exports = userService;
