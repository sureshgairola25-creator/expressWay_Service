const express = require('express');
const router = express.Router();
const { forgotPassword, resetPassword } = require('../controllers/authController');
const { forgotPasswordLimiter, resetPasswordLimiter } = require('../middleware/rateLimit');

router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPasswordLimiter, resetPassword);


module.exports = router;
