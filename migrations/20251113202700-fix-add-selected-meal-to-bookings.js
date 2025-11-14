'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // First check if the column already exists
    const [results] = await queryInterface.sequelize.query(
      `SHOW COLUMNS FROM Bookings LIKE 'selected_meal'`
    );
    
    // Only add the column if it doesn't exist
    if (results.length === 0) {
      await queryInterface.addColumn('Bookings', 'selected_meal', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: null
      });
      console.log('Added selected_meal column to Bookings table');
    } else {
      console.log('selected_meal column already exists in Bookings table');
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Bookings', 'selected_meal');
  }
};
