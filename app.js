const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cors = require('cors');
const csrf = require('csurf');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Check required environment variables
const requiredEnvVars = ['NODE_ENV', 'PORT', 'MONGO_FULL_URL', 'ENCRYPTION_KEY', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// Import routes and middleware
const errorHandler = require('./middleware/error-handler');
const { corsOptions } = require('./middleware/cors');
const { csrfProtection } = require('./middleware/csrf');

// Import database connection
const sequelize = require('./src/db/database');

// Database sync is handled in database.js with minimal logging

const db = require('./src/db/models');

// Import routes
const indexRouter = require('./src/index');
const CashfreeWebhook = require('./src/controllers/cashfreeWebhook');

// Initialize express app
const app = express();


app.post(
  "/cashfree/webhook",
  express.raw({ type: "*/*" }),
  CashfreeWebhook
);
// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Set security HTTP headers
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "https://sdk.cashfree.com"],
      "frame-src": ["'self'", "https://sdk.cashfree.com"],
      "form-action": ["'self'", "https://sandbox.cashfree.com"],
      "img-src": ["'self'", "data:", "blob:", process.env.APP_URL || 'http://localhost:3000'],
    },
  })
);

// Development logging
if (process.env.NODE_ENV === 'development') {
  app.use(logger('dev'));
}

// Limit requests from same API
const limiter = rateLimit({
  max: 100, // 100 requests per windowMs
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: 'Too many requests from this IP, please try again in 15 minutes!'
});
app.use('/api', limiter);

// Body parser, reading data from body into req.body
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Prevent parameter pollution
app.use(hpp({
  whitelist: [
    'duration', 'ratingsQuantity', 'ratingsAverage', 'maxGroupSize', 'difficulty', 'price'
  ]
}));

// Serving static files
app.use(express.static(path.join(__dirname, 'public')));

// CORS configuration
app.use(cors(corsOptions));

// CSRF Protection
// app.use(csrfProtection);

// Set secure cookie options
const isProduction = process.env.NODE_ENV === 'production';
const cookieOptions = {
  domain: process.env.DOMAIN_HOST || 'localhost',
  secure: isProduction, // Only send over HTTPS in production
  httpOnly: true,
  sameSite: isProduction ? 'strict' : 'lax', // CSRF protection
  maxAge: 24 * 60 * 60 * 1000, // 1 day
  path: '/',
};

// Set CSRF token cookie
// app.use((req, res, next) => {
//   res.cookie('XSRF-TOKEN', req.csrfToken(), cookieOptions);
//   next();
// });

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Mount routes
app.use('/', indexRouter);

// Global error handling middleware - must be before 404 handler
app.use(errorHandler);

// Handle 404 - Keep this after all other routes and error handler
app.all('*', (req, res, next) => {
  res.status(404).json({
    status: 'fail',
    message: `Can't find ${req.originalUrl} on this server!`
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  // Close server & exit process
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});

// Start server
const port = process.env.PORT || 3000;

// Sync database and start server
const server = app.listen(port, async () => {
  try {
    await db.sequelize.sync();
    console.log('✅ Database synchronized successfully!');
    console.log(`Server running on port ${port} in ${process.env.NODE_ENV} mode`);
  } catch (error) {
    console.error('❌ Error synchronizing database:', error);
    process.exit(1);
  }
});

module.exports = { app, server };
