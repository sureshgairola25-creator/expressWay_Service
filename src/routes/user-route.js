const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect, authorize, ownerOrAdmin } = require('../../middleware/auth');
const { loginLimiter, forgotPasswordLimiter, resetPasswordLimiter } = require('../middleware/rateLimit');

// ── Public ────────────────────────────────────────────────────────────────────
router.post('/signup',       userController.signup);
router.post('/verify',       userController.verify);
router.post('/register',     userController.register);
router.post('/login',        loginLimiter, userController.login);
router.post('/google-login', userController.googleLogin);
router.post('/set-password', userController.setPassword);

// Issue a new access token using a valid refresh token (no access token needed)
router.post('/refresh-token', userController.refreshToken);

router.post('/forgot-password',  forgotPasswordLimiter, userController.forgotPassword);
router.post('/verify-reset-otp', userController.verifyResetOtp);
router.post('/reset-password',   resetPasswordLimiter,  userController.resetPassword);

// ── Authenticated user routes ─────────────────────────────────────────────────
router.get('/me', protect, userController.getMe);

// ownerOrAdmin: only the user themselves (or an admin) can view their rides
router.get('/rides/:userId', protect, ownerOrAdmin(req => req.params.userId), userController.getUserRides);

router.put('/update/:id', protect, ownerOrAdmin(req => req.params.id), userController.updateProfile);
router.post('/logout', protect, userController.logout);

// ── Admin-only ────────────────────────────────────────────────────────────────
router.get('/users', protect, authorize('admin'), userController.getUsers);

module.exports = router;
