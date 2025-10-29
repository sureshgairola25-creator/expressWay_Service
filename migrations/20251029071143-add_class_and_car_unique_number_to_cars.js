'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Cars', 'class', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Class of the car (e.g., premium, classic)'
    });

    await queryInterface.addColumn('Cars', 'carUniqueNumber', {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true,
      comment: 'Unique identifier for the car (different from registration number)'
    });

    // Add index for better query performance
    await queryInterface.addIndex('Cars', ['carUniqueNumber'], {
      unique: true,
      name: 'cars_car_unique_number_unique'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Cars', 'class');
    await queryInterface.removeColumn('Cars', 'carUniqueNumber');
    await queryInterface.removeIndex('Cars', 'cars_car_unique_number_unique');
  }
};
