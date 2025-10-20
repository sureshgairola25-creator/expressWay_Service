const userService = require('../services/userService');
const asyncHandler = require('../../middleware/async');

const userController = {
  register: asyncHandler(async (req, res) => {
    const user = await userService.registerUser(req.body);
    res.status(201).json({ success: true, data: user });
  }),

  login: asyncHandler(async (req, res) => {
    const { token, user } = await userService.loginUser(req.body);
    res.status(200).json({ success: true, token, data: user });
  }),

  googleLogin: asyncHandler(async (req, res) => {
    const { idToken } = req.body;
    const { token, user } = await userService.googleLogin(idToken);
    res.status(200).json({ success: true, token, data: user });
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
};

module.exports = userController;
