const express = require('express');
const reviewController = require('../controllers/reviewController');
const { protect, authorize } = require('../../middleware/auth');
const { validate } = require('../middleware/validate');
const { 
  validateCreateReview, 
  validateTripId, 
  validateReviewFilters 
} = require('../middleware/validators/reviewValidator');

const router = express.Router();

// Public routes
router.get('/public', reviewController.getPublicReviews);
router.get('/trip/:tripId', validate(validateTripId), reviewController.getReviewsByTrip);

// Protected routes (require authentication)
router.use(protect);
router.post('/', reviewController.createReview);
router.get('/my-reviews', protect, reviewController.getMyReviews);

// Admin routes
router.use(authorize('admin'));
router.get('/', validate(validateReviewFilters), reviewController.getReviews);

module.exports = router;
