const jwt = require('jsonwebtoken');
const asyncHandler = require('./async');
const { User } = require('../src/db/models');
const { Unauthorized, Forbidden } = require('http-errors');
const { tokenBlacklist } = require('../src/services/userService');

// Protect routes
exports.protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    // Set token from Bearer token in header
    token = req.headers.authorization.split(' ')[1];
  }
  // Set token from cookie
  // else if (req.cookies.token) {
  //   token = req.cookies.token;
  // }

  // Make sure token exists and is not blacklisted
  if (!token) {
    return next(new Unauthorized('Not authorized to access this route'));
  }

  // Check if token is blacklisted
  // if (tokenBlacklist.has(token)) {
  //   return next(new Unauthorized('Token has been invalidated. Please log in again.'));
  // }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findByPk(decoded.id);

    if (!req.user) {
      return next(new Unauthorized('Not authorized to access this route'));
    }

    next();
  } catch (err) {
    return next(new Unauthorized('Not authorized to access this route'));
  }
});

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new Forbidden(
          `User role ${req.user.role} is not authorized to access this route`
        )
      );
    }
    next();
  };
};

// Admin middleware
exports.admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  next(new Forbidden('Not authorized as an admin'));
};
