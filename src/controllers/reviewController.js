const { Review, Booking, Trip, User } = require('../db/models');
const asyncHandler = require('../../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const reviewService = require('../services/reviewService');

// @desc    Create a review
// @route   POST /api/v1/reviews
// @access  Private
const createReview = asyncHandler(async (req, res, next) => {
  const { bookingId, rating, feedback } = req.body;
  const userId = req.user.id;
  // console.log(userId,bookingId,rating,feedback);
  
  const review = await reviewService.createReview({
    userId,
    bookingId,
    rating,
    feedback
  });

  res.status(201).json({
    success: true,
    data: review,
    message: 'Review Posted successfully'
  });
});

// @desc    Get all public reviews
// @route   GET /api/v1/reviews/public
// @access  Public
const getPublicReviews = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;

  const { reviews, total } = await reviewService.getPublicReviews({
    page,
    limit
  });

  res.status(200).json({
    success: true,
    count: reviews.length,
    total,
    data: reviews,
    message: 'Reviews fetched successfully'
  });
});

// @desc    Get reviews by trip ID
// @route   GET /api/v1/reviews/trip/:tripId
// @access  Public
const getReviewsByTrip = asyncHandler(async (req, res, next) => {
  const { tripId } = req.params;
  
  const reviews = await reviewService.getReviewsByTrip(tripId);

  res.status(200).json({
    success: true,
    count: reviews.length,
    data: reviews
  });
});

// @desc    Get current user's reviews
// @route   GET /api/v1/reviews/me
// @access  Private
const getMyReviews = asyncHandler(async (req, res, next) => {
  const reviews = await reviewService.getUserReviews(req.user.id);

  res.status(200).json({
    success: true,
    count: reviews.length,
    data: reviews
  });
});

// @desc    Get all reviews (Admin)
// @route   GET /api/v1/reviews
// @access  Private/Admin
const getReviews = asyncHandler(async (req, res, next) => {
  const { rating, tripId, userId } = req.query;
  
  const filters = { rating, tripId, userId };
  const reviews = await reviewService.getAllReviews(filters);

  res.status(200).json({
    success: true,
    count: reviews.length,
    data: reviews
  });
});

module.exports = {
  createReview,
  getPublicReviews,
  getReviewsByTrip,
  getMyReviews,
  getReviews
};
