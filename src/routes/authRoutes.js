const express = require('express');
const router = express.Router();
const { 
  forgotPassword, 
  resetPassword 
} = require('../controllers/authController');
const { 
  getGoogleAuthURL, 
  googleCallback,
  getCurrentUser,
  logout
} = require('../controllers/googleAuthController');
const { forgotPasswordLimiter, resetPasswordLimiter } = require('../middleware/rateLimit');
const { protect } = require('../middleware/auth');

// Password reset routes
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPasswordLimiter, resetPassword);

// Google OAuth routes
router.get('/google/url', getGoogleAuthURL);
router.get('/google/callback', googleCallback);

// Auth routes
router.get('/me', protect, getCurrentUser);
router.post('/logout', protect, logout);

module.exports = router;
