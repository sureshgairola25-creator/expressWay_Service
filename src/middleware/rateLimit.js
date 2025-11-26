const rateLimit = require('express-rate-limit');

// Rate limiting configuration for forgot password endpoint
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 forgot password requests per windowMs
  message: {
    success: false,
    message: 'Too many password reset requests from this IP, please try again after an hour',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skipFailedRequests: true, // Don't count failed requests (like invalid email format)
  keyGenerator: (req) => {
    // Use both IP and email for rate limiting to prevent email enumeration
    return `${req.ip}:${req.body.email || ''}`.toLowerCase();
  },
});

// Rate limiting for reset password endpoint
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 reset attempts per windowMs
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use token for rate limiting to prevent brute force
    return `${req.ip}:${req.body.token || ''}`;
  },
});

// Rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: {
    success: false,
    message: 'Too many login attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use both IP and email for rate limiting
    return `${req.ip}:${req.body.email || ''}`.toLowerCase();
  },
  skipSuccessfulRequests: true, // Only count failed login attempts
});

module.exports = {
  forgotPasswordLimiter,
  resetPasswordLimiter,
  loginLimiter,
};
