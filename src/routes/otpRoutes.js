const express = require('express');
const otpController = require('../controllers/otpController');

const router = express.Router();

// @route   POST /api/users/send-otp
// @desc    Send OTP to email or phone
// @access  Public
router.post('/send-otp', otpController.sendOtp);

// @route   POST /api/users/verify-otp
// @desc    Verify OTP and return JWT token
// @access  Public
router.post('/verify-otp', otpController.verifyOtp);

module.exports = router;
