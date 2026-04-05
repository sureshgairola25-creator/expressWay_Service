'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDesc = await queryInterface.describeTable('trips');

    if (!tableDesc.available_seats) {
      await queryInterface.addColumn('trips', 'available_seats', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null
      });
    }
    if (!tableDesc.total_seats_snapshot) {
      await queryInterface.addColumn('trips', 'total_seats_snapshot', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }
    if (!tableDesc.seats_per_cabin_snapshot) {
      await queryInterface.addColumn('trips', 'seats_per_cabin_snapshot', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }
    if (!tableDesc.booking_mode_snapshot) {
      await queryInterface.addColumn('trips', 'booking_mode_snapshot', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('trips', 'available_seats');
    await queryInterface.removeColumn('trips', 'total_seats_snapshot');
    await queryInterface.removeColumn('trips', 'seats_per_cabin_snapshot');
    await queryInterface.removeColumn('trips', 'booking_mode_snapshot');
  }
};