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
  
  setPassword: asyncHandler(async (req, res) => {
    const { identifier, password } = req.body;
    const result = await userService.setPassword(identifier, password);
    res.status(200).json(result);
  }),
}

module.exports = userController;
