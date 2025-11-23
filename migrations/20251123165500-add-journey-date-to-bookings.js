'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Bookings', 'journeyDate', {
      type: Sequelize.DATEONLY,
      allowNull: true, // Making it nullable for backward compatibility
      field: 'journey_date',
      comment: 'The actual date of the journey for recurring trips'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Bookings', 'journeyDate');
  }
};
