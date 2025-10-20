const jwt = require('jsonwebtoken');
const asyncHandler = require('./async');
const { User } = require('../src/db/models');
const { Unauthorized } = require('http-errors');

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

  // Make sure token exists
  if (!token) {
    return next(new Unauthorized('Not authorized to access this route'));
  }

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
