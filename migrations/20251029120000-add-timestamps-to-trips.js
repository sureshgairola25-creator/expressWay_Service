'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if created_at column exists
    const [createdAtResults] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM Trips LIKE 'created_at'"
    );

    // Add created_at column if it doesn't exist
    if (createdAtResults.length === 0) {
      await queryInterface.addColumn('Trips', 'created_at', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      });
    }

    // Check if updated_at column exists
    const [updatedAtResults] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM Trips LIKE 'updated_at'"
    );

    // Add updated_at column if it doesn't exist
    if (updatedAtResults.length === 0) {
      await queryInterface.addColumn('Trips', 'updated_at', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      });
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove the columns if they exist (for rollback)
    await queryInterface.removeColumn('Trips', 'created_at');
    await queryInterface.removeColumn('Trips', 'updated_at');
  }
};
