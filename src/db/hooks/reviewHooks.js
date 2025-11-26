// After creating or deleting a review, update the trip's review stats
const updateTripReviewStats = async (review, options) => {
  try {
    const trip = await review.getTrip();
    if (trip && typeof trip.getReviewStats === 'function') {
      const stats = await trip.getReviewStats();
      await trip.update({
        reviewCount: stats.reviewCount,
        averageRating: stats.averageRating
      }, { transaction: options?.transaction });
    }
  } catch (error) {
    console.error('Error updating trip review stats:', error);
  }
};

const setupReviewHooks = (sequelize) => {
  const Review = sequelize.models.Review;
  
  if (!Review) {
    console.error('Review model not found in sequelize models');
    return;
  }
  
  // Add hooks to update review stats when reviews are created or deleted
  Review.afterCreate(updateTripReviewStats);
  Review.afterDestroy(updateTripReviewStats);
  
  // console.log('Review hooks initialized successfully');
};

module.exports = {
  setupReviewHooks,
  updateTripReviewStats
};
