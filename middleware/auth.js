const jwt = require('jsonwebtoken');
const asyncHandler = require('./async');
const { User } = require('../src/db/models');
const { Unauthorized, Forbidden } = require('http-errors');

// ── protect: verify JWT, load req.user ────────────────────────────────────────
exports.protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return next(new Unauthorized('No token provided — please log in'));
  }

  // Reject blacklisted (logged-out) tokens immediately
  const { tokenBlacklist } = require('../src/services/userService');
  if (tokenBlacklist && tokenBlacklist.has(token)) {
    return next(new Unauthorized('Token has been invalidated — please log in again'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findByPk(decoded.id, { attributes: { exclude: ['password'] } });
    if (!req.user) {
      return next(new Unauthorized('User no longer exists'));
    }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new Unauthorized('Access token expired — use /user/refresh-token to get a new one'));
    }
    return next(new Unauthorized('Invalid token — please log in again'));
  }
});

// ── authorize: gate by role(s) ────────────────────────────────────────────────
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new Forbidden(`Role '${req.user.role}' is not permitted to access this route`));
    }
    next();
  };
};

// ── admin shorthand ───────────────────────────────────────────────────────────
exports.admin = (req, res, next) => {
  if (req.user?.role === 'admin') return next();
  next(new Forbidden('Admin access required'));
};

// ── ownerOrAdmin: resource must belong to req.user unless the user is admin ───
// getOwnerId can be a function(req) → id, or a string param name e.g. 'userId'
//
// Example usage in routes:
//   router.get('/rides/:userId', protect, ownerOrAdmin(req => req.params.userId), ctrl)
exports.ownerOrAdmin = (getOwnerId) => asyncHandler(async (req, res, next) => {
  if (req.user.role === 'admin') return next();
  const ownerId = typeof getOwnerId === 'function' ? await getOwnerId(req) : req.params[getOwnerId];
  if (String(req.user.id) !== String(ownerId)) {
    return next(new Forbidden('Not authorized to access this resource'));
  }
  next();
});
