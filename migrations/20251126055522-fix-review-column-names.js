'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // First, drop the existing index
    await queryInterface.removeIndex('Reviews', ['userId', 'bookingId']);
    
    // Rename columns to match the model
    await queryInterface.renameColumn('Reviews', 'userId', 'user_id');
    await queryInterface.renameColumn('Reviews', 'bookingId', 'booking_id');
    await queryInterface.renameColumn('Reviews', 'tripId', 'trip_id');
    
    // Recreate the index with the new column names
    await queryInterface.addIndex('Reviews', ['user_id', 'booking_id'], {
      unique: true,
      name: 'reviews_user_id_booking_id'
    });
  },

  async down(queryInterface, Sequelize) {
    // Drop the index
    await queryInterface.removeIndex('Reviews', 'reviews_user_id_booking_id');
    
    // Revert column names
    await queryInterface.renameColumn('Reviews', 'user_id', 'userId');
    await queryInterface.renameColumn('Reviews', 'booking_id', 'bookingId');
    await queryInterface.renameColumn('Reviews', 'trip_id', 'tripId');
    
    // Recreate the original index
    await queryInterface.addIndex('Reviews', ['userId', 'bookingId'], {
      unique: true,
      name: 'reviews_userId_bookingId'
    });
  }
};
