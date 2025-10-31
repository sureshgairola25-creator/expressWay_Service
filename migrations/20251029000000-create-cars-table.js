'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Cars', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      carName: {
        type: Sequelize.STRING,
        allowNull: false
      },
      carType: {
        type: Sequelize.STRING,
        allowNull: true
      },
      class: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'standard',
        validate: {
          isIn: [['standard', 'premium', 'classic', 'luxury', 'business']]
        }
      },
      carUniqueNumber: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: true,
          len: [3, 20]
        }
      },
      totalSeats: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      registrationNumber: {
        type: Sequelize.STRING,
        allowNull: false
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
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Cars');
  }
};
