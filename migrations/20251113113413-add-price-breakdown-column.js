'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [results] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM Bookings LIKE 'price_breakdown'"
    );
    
    if (results.length === 0) {
      await queryInterface.addColumn('Bookings', 'price_breakdown', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: {}
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Bookings', 'price_breakdown');
  }
};
