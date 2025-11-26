const { Op } = require('sequelize');
const { Review, Booking, Trip, User, StartLocation, EndLocation } = require('../db/models');
const ErrorResponse = require('../utils/errorResponse');

/**
 * Create a new review
 * @param {Object} reviewData - Review data including userId, bookingId, rating, and optional feedback
 * @returns {Promise<Object>} Created review
 */
const createReview = async (reviewData) => {
  const { userId, bookingId } = reviewData;

  // Check if booking exists and belongs to user
  const booking = await Booking.findOne({
    where: { 
      id: bookingId,
      userId
    },
    include: [
      {
        model: Trip,
        as: 'trip',
        attributes: ['id', 'startLocationId', 'endLocationId']
      }
    ]
  });

  if (!booking) {
    throw new ErrorResponse('No booking found with this ID or unauthorized', 404);
  }

  // Check if booking status is either 'confirmed' or 'completed'
  if (!['confirmed', 'completed'].includes(booking.bookingStatus)) {
    throw new ErrorResponse('You can only review confirmed or completed bookings', 400);
  }

  // Check if review already exists for this booking
  const existingReview = await Review.findOne({
    where: { 
      booking_id: bookingId 
    },
    raw: true // Add this to get plain JSON object
  });

  if (existingReview) {
    throw new ErrorResponse('You have already reviewed this booking', 409);
  }

  // Create review with correct field names
  const reviewDataToCreate = {
    userId: reviewData.userId,
    bookingId: reviewData.bookingId,
    tripId: booking.trip.id,
    rating: reviewData.rating,
    feedback: reviewData.feedback,
    // isAnonymous: reviewData.isAnonymous
  };
  
  console.log(reviewDataToCreate,reviewData,"reviewDataToCreate reviewData");
  
  
  // if (reviewData.is_anonymous !== undefined) {
  //   reviewDataToCreate.is_anonymous = reviewData.is_anonymous;
  // }
  
  const review = await Review.create(reviewDataToCreate);

  return review;
};

/**
 * Get public reviews with pagination
 * @param {Object} options - Pagination options
 * @param {number} options.page - Page number
 * @param {number} options.limit - Number of items per page
 * @returns {Promise<Object>} Paginated reviews
 */
const getPublicReviews = async ({ page = 1, limit = 20 }) => {
  const offset = (page - 1) * limit;

  const { count, rows: reviews } = await Review.findAndCountAll({
    attributes: ['id', 'rating', 'feedback', 'created_at'],
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'firstName', 'lastName']
      },
      {
        model: Trip,
        as: 'trip',
        attributes: ['id'],
        include: [
          {
            model: StartLocation,
            as: 'startLocation',
            attributes: ['name']
          },
          {
            model: EndLocation,
            as: 'endLocation',
            attributes: ['name']
          }
        ]
      }
    ],
    order: [['created_at', 'DESC']],
    limit,
    offset
  });

  // Transform data for response
  const transformedReviews = reviews.map(review => ({
    id: review.id,
    rating: review.rating,
    feedback: review.feedback,
    userName: review.user ? `${review.user.firstName.charAt(0)}. ${review.user.lastName}` : 'Anonymous',
    route: review.trip && review.trip.startLocation && review.trip.endLocation 
      ? `${review.trip.startLocation.name} → ${review.trip.endLocation.name}`
      : 'Unknown Route',
    date: review.created_at
  }));

  return {
    reviews: transformedReviews,
    total: count
  };
};

/**
 * Get reviews by trip ID
 * @param {number} tripId - ID of the trip
 * @returns {Promise<Array>} List of reviews for the trip
 */
const getReviewsByTrip = async (tripId) => {
  const reviews = await Review.findAll({
    where: { tripId },
    attributes: ['id', 'rating', 'feedback', 'createdAt'],
    include: [
      {
        model: User,
        as: 'user',
        attributes: [
          [
            require('sequelize').literal("CONCAT(LEFT(firstName, 1), '. ', lastName)"),
            'userName'
          ]
        ]
      }
    ],
    order: [['createdAt', 'DESC']]
  });

  return reviews.map(review => ({
    ...review.get({ plain: true }),
    date: review.createdAt
  }));
};

/**
 * Get all reviews for a specific user
 * @param {number} userId - ID of the user
 * @returns {Promise<Array>} List of user's reviews
 */
const getUserReviews = async (userId) => {
  const reviews = await Review.findAll({
    where: { userId },
    attributes: ['id', 'rating', 'feedback', 'createdAt'],
    include: [
      {
        model: Trip,
        as: 'trip',
        attributes: ['id'],
        include: [
          {
            model: StartLocation,
            as: 'startLocation',
            attributes: ['name']
          },
          {
            model: EndLocation,
            as: 'endLocation',
            attributes: ['name']
          }
        ]
      }
    ],
    order: [['createdAt', 'DESC']]
  });

  return reviews.map(review => ({
    ...review.get({ plain: true }),
    trip: {
      ...review.trip.get({ plain: true }),
      route: review.trip.startLocation && review.trip.endLocation
        ? `${review.trip.startLocation.name} → ${review.trip.endLocation.name}`
        : 'Unknown Route'
    }
  }));
};

/**
 * Get all reviews with optional filters (Admin only)
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Filtered list of reviews
 */
const getAllReviews = async (filters = {}) => {
  const { rating, tripId, userId } = filters;
  const where = {};
  
  // if (rating) where.rating = rating;
  // if (tripId) where.tripId = tripId;
  // if (userId) where.userId = userId;

  const reviews = await Review.findAll({
    where,
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'firstName', 'lastName', 'email']
      },
      {
        model: Trip,
        as: 'trip',
        attributes: ['id'],
        include: [
          {
            model: StartLocation,
            as: 'startLocation',
            attributes: ['name']
          },
          {
            model: EndLocation,
            as: 'endLocation',
            attributes: ['name']
          }
        ]
      }
    ],
    order: [['createdAt', 'DESC']]
  });

  return reviews.map(review => ({
    ...review.get({ plain: true }),
    trip: {
      ...review.trip.get({ plain: true }),
      route: review.trip.startLocation && review.trip.endLocation
        ? `${review.trip.startLocation.name} → ${review.trip.endLocation.name}`
        : 'Unknown Route'
    }
  }));
};

module.exports = {
  createReview,
  getPublicReviews,
  getReviewsByTrip,
  getUserReviews,
  getAllReviews
};
