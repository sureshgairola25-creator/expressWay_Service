const { body, param, query } = require('express-validator');
const { Booking } = require('../../db/models');

// Validation for creating a review
exports.validateCreateReview = [
  body('bookingId')
    .isInt({ min: 1 })
    .withMessage('Please provide a valid booking ID')
    .custom(async (value, { req }) => {
      const booking = await Booking.findByPk(value);
      if (!booking) {
        throw new Error('No booking found with this ID');
      }
      if (booking.userId !== req.user.id) {
        throw new Error('Not authorized to review this booking');
      }
      return true;
    }),

  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be an integer between 1 and 5'),

  body('feedback')
    .optional()
    .isString()
    .isLength({ max: 2000 })
    .withMessage('Feedback must be less than 2000 characters')
    .trim()
    .escape()
];

// Validation for getting reviews by trip ID
exports.validateTripId = [
  param('tripId')
    .isInt({ min: 1 })
    .withMessage('Please provide a valid trip ID')
];

// Validation for admin review filters
exports.validateReviewFilters = [
  query('rating')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be an integer between 1 and 5'),
    
  query('tripId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Trip ID must be a positive integer'),
    
  query('userId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('User ID must be a positive integer'),
    
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
    
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];
