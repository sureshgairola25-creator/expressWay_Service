'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('Bookings', 'price_breakdown', {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: {}
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('Bookings', 'price_breakdown');
  }
};
