'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('Cars');

    if (!tableDescription.available_modes) {
      await queryInterface.addColumn('Cars', 'available_modes', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: null,
        comment: 'Ride modes this vehicle supports. NULL = use cabType only.'
      });
    }

    if (!tableDescription.vehicle_category) {
      await queryInterface.addColumn('Cars', 'vehicle_category', {
        type: Sequelize.ENUM('Compact', 'Executive', 'Family', 'Grand'),
        allowNull: true,
        defaultValue: null,
        comment: 'Category used to filter personalized rides.'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Cars', 'available_modes');
    await queryInterface.removeColumn('Cars', 'vehicle_category');
  }
};
