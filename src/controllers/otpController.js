const otpService = require('../services/otpService');
const asyncHandler = require('../../middleware/async');

const otpController = {
  sendOtp: asyncHandler(async (req, res) => {
    const { identifier, type } = req.body;

    const result = await otpService.sendOtp(identifier, type);
    res.status(200).json({ success: true, data: result });
  }),

  verifyOtp: asyncHandler(async (req, res) => {
    const { identifier, type, otp } = req.body;

    const result = await otpService.verifyOtp(identifier, type, otp);
    res.status(200).json({ success: true, data: result });
  }),
};

module.exports = otpController;
