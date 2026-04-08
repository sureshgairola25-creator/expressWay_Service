const userService = require('../services/userService');
const asyncHandler = require('../../middleware/async');

const userController = {

  signup: asyncHandler(async (req, res) => {
    const { identifier } = req.body;
    const result = await userService.signup(identifier);
    res.status(200).json(result);
  }),

  verify: asyncHandler(async (req, res) => {
    const { identifier, token } = req.body;
    const result = await userService.verify(identifier, token);
    res.status(200).json(result);
  }),

  register: asyncHandler(async (req, res) => {
    const user = await userService.registerUser(req.body);
    res.status(201).json({ success: true, data: user });
  }),

  login: asyncHandler(async (req, res) => {
    const { token, refreshToken, user } = await userService.loginUser(req.body);
    res.status(200).json({ success: true, token, refreshToken, data: user });
  }),

  googleLogin: asyncHandler(async (req, res) => {
    const { idToken } = req.body;
    const { token, refreshToken, user } = await userService.googleLogin(idToken);
    res.status(200).json({ success: true, token, refreshToken, data: user });
  }),

  getMe: asyncHandler(async (req, res) => {
    // req.user is set by the protect middleware
    const user = req.user;
    user.password = undefined;
    res.status(200).json({ success: true, data: user });
  }),

  updateProfile: asyncHandler(async (req, res) => {
    const user = await userService.updateProfile(req.params.id, req.body);
    res.status(200).json({ success: true, data: user });
  }),
  
  setPassword: asyncHandler(async (req, res) => {
    const { identifier, password } = req.body;
    const result = await userService.setPassword(identifier, password);
    res.status(200).json(result);
  }),
  
  getUserRides: asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const result = await userService.getUserRides(userId, { 
      page: parseInt(page, 10), 
      limit: parseInt(limit, 10) 
    });
    
    res.status(200).json({
      success: true,
      data:result
    });
  }),

  // @route   POST /api/users/logout
  // @desc    Logout — blacklists access token + revokes refresh token in DB
  // @access  Private
  logout: asyncHandler(async (req, res) => {
    const accessToken = req.header('Authorization')?.replace('Bearer ', '');
    const { refreshToken } = req.body;
    const result = await userService.logout(accessToken, refreshToken);
    res.status(200).json(result);
  }),

  // @route   POST /api/users/refresh-token
  // @desc    Issue new access token using a valid refresh token
  // @access  Public
  refreshToken: asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const result = await userService.refreshAccessToken(refreshToken);
    res.status(200).json({ success: true, ...result });
  }),

  // @route   GET /api/admin/users
  // @desc    Get all users (Admin only)
  // @access  Private/Admin
  getUsers: asyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const { data, pagination } = await userService.getAllUsers({ page, limit });
    res.status(200).json({ success: true, data, pagination });
  }),

  // POST /api/users/forgot-password
// Body: { identifier: "email@example.com" | "+911234567890" }
forgotPassword: asyncHandler(async (req, res) => {
  const { identifier } = req.body;
  if (!identifier) {
    return res.status(400).json({ success: false, message: 'Email or mobile number is required' });
  }
  const result = await userService.forgotPassword(identifier);
  res.status(200).json(result);
}),
 
// POST /api/users/verify-reset-otp
// Body: { identifier, otp }
verifyResetOtp: asyncHandler(async (req, res) => {
  const { identifier, otp } = req.body;
  if (!identifier || !otp) {
    return res.status(400).json({ success: false, message: 'Identifier and OTP are required' });
  }
  const result = await userService.verifyResetOtp(identifier, otp);
  res.status(200).json(result);
}),
 
// POST /api/users/reset-password
// Body: { identifier, otp, newPassword }
resetPassword: asyncHandler(async (req, res) => {
  const { identifier, otp, newPassword } = req.body;
  if (!identifier || !otp || !newPassword) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }
  const result = await userService.resetPassword(identifier, otp, newPassword);
  res.status(200).json(result);
}),
};

module.exports = userController;
