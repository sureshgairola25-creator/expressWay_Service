'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Coupons', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      code: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
        set(value) {
          this.setDataValue('code', value.toUpperCase());
        }
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      discountType: {
        type: Sequelize.ENUM('PERCENTAGE', 'FLAT'),
        allowNull: false
      },
      discountValue: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      minOrderAmount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      maxDiscountAmount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      startDate: {
        type: Sequelize.DATE,
        allowNull: false
      },
      endDate: {
        type: Sequelize.DATE,
        allowNull: false
      },
      status: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      usageLimitPerUser: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      totalUsageLimit: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      totalUsed: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      imageUrl: {
        type: Sequelize.STRING,
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });

    // Add index for better query performance
    await queryInterface.addIndex('Coupons', ['code']);
    await queryInterface.addIndex('Coupons', ['status', 'startDate', 'endDate']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Coupons');
  }
};
