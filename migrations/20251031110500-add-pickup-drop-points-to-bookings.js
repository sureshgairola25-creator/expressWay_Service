'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Bookings', 'pickupPointId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'PickupPoints',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      field: 'pickup_point_id'
    });

    await queryInterface.addColumn('Bookings', 'dropPointId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'DropPoints',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      field: 'drop_point_id'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Bookings', 'pickupPointId');
    await queryInterface.removeColumn('Bookings', 'dropPointId');
  }
};
