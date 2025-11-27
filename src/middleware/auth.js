const jwt = require('jsonwebtoken');
const User = require('../db/models/User');
const asyncHandler = require('../../middleware/async');

const ErrorResponse = require('../utils/errorResponse');

// Protect routes
exports.protect = asyncHandler(async (req, res, next) => {
  let token;

  // Get token from header or cookie
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    // Get token from header
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.token) {
    // Get token from cookie
    token = req.cookies.token;
  } else if (req.query.token) {
    // Get token from query parameter (for OAuth redirects)
    token = req.query.token;
  }

  // Make sure token exists
  if (!token) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from the token
    req.user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] },
    });

    if (!req.user) {
      return next(new ErrorResponse('User not found', 404));
    }

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }
});

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new ErrorResponse(
          `User role ${req.user.role} is not authorized to access this route`,
          403
        )
      );
    }
    next();
  };
};
