'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Bookings', 'couponId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Coupons',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('Bookings', 'couponCode', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.addColumn('Bookings', 'discountAmount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    });

    // Add index for better query performance
    await queryInterface.addIndex('Bookings', ['couponId']);
    await queryInterface.addIndex('Bookings', ['couponCode']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Bookings', 'couponId');
    await queryInterface.removeColumn('Bookings', 'couponCode');
    await queryInterface.removeColumn('Bookings', 'discountAmount');
  }
};
