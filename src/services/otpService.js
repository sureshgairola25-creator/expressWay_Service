const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const sgMail = require('@sendgrid/mail');
const { User, Otp } = require('../db/models');
const { BadRequest, Unauthorized, Conflict } = require('http-errors');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

const client = twilio(accountSid, authToken);

// Set SendGrid API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Generate 6-digit OTP
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const otpService = {
  sendOtp: async (identifier, type) => {
    if (!identifier || !type) {
      throw new BadRequest('Identifier (email or phone) and type are required');
    }

    if (!['email', 'phone'].includes(type)) {
      throw new BadRequest('Type must be either email or phone');
    }

    // Check if user exists for this identifier
    const existingUser = await User.findOne({
      where: type === 'email' ? { email: identifier } : { phoneNo: identifier }
    });

    // Generate 6-digit OTP
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    // Save OTP to database
    await Otp.create({
      identifier,
      type,
      otp,
      expiresAt,
      isUsed: false,
    });

    // Send OTP via appropriate channel
    try {
      if (type === 'phone') {
        // Send via Twilio
        const verification = await client.verify.v2.services(verifyServiceSid)
          .verifications
          .create({ to: identifier, channel: 'sms' });
        return { success: true, message: 'OTP sent successfully via SMS' };
      } else {
        // Send via email using SendGrid
        const msg = {
          to: identifier,
          from: process.env.SENDGRID_FROM_EMAIL,
          subject: 'Your OTP for ExpressWayCab',
          text: `Your OTP is: ${otp}. It expires in 5 minutes.`,
          html: `<p>Your OTP is: <strong>${otp}</strong></p><p>It expires in 5 minutes.</p>`,
        };

        await sgMail.send(msg);
        return { success: true, message: 'OTP sent successfully via email' };
      }
    } catch (error) {
      console.error('OTP sending error:', error);
      throw new BadRequest('Failed to send OTP. Please try again.');
    }
  },

  verifyOtp: async (identifier, type, otp) => {
    if (!identifier || !type || !otp) {
      throw new BadRequest('Identifier, type, and OTP are required');
    }

    // Find the OTP record
    const otpRecord = await Otp.findOne({
      where: {
        identifier,
        type,
        otp,
        isUsed: false,
      },
    });

    if (!otpRecord) {
      throw new Unauthorized('Invalid OTP');
    }

    // Check if OTP has expired
    if (otpRecord.expiresAt < new Date()) {
      throw new Unauthorized('OTP has expired');
    }

    // Mark OTP as used
    otpRecord.isUsed = true;
    await otpRecord.save();

    // Check if user exists
    const user = await User.findOne({
      where: type === 'email' ? { email: identifier } : { phoneNo: identifier }
    });

    if (user) {
      // User exists, generate JWT token
      const token = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );
      return { token, user: { id: user.id, email: user.email, phoneNo: user.phoneNo }, isNewUser: false };
    } else {
      // Create new user
      const newUser = await User.create({
        firstName: type === 'email' ? identifier.split('@')[0] : 'User',
        lastName: '',
        email: type === 'email' ? identifier : null,
        phoneNo: type === 'phone' ? identifier : null,
        isVerified: true,
      });

      const token = jwt.sign(
        { id: newUser.id, email: newUser.email },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );
      return { token, user: { id: newUser.id, email: newUser.email, phoneNo: newUser.phoneNo }, isNewUser: true };
    }
  },
};

module.exports = otpService;
