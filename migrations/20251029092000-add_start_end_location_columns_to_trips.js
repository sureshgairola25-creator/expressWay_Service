'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // First, check if the columns already exist
    const [results] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM Trips LIKE 'startLocationId'"
    );

    if (results.length === 0) {
      // Add startLocationId column
      await queryInterface.addColumn('Trips', 'startLocationId', {
        type: Sequelize.INTEGER,
        allowNull: true, // Temporarily allow null for existing data
        references: {
          model: 'StartLocations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    // Check if endLocationId column exists
    const [endResults] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM Trips LIKE 'endLocationId'"
    );

    if (endResults.length === 0) {
      // Add endLocationId column
      await queryInterface.addColumn('Trips', 'endLocationId', {
        type: Sequelize.INTEGER,
        allowNull: true, // Temporarily allow null for existing data
        references: {
          model: 'EndLocations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove the foreign key constraints first
    await queryInterface.removeConstraint('Trips', 'Trips_startLocationId_foreign_idx');
    await queryInterface.removeConstraint('Trips', 'Trips_endLocationId_foreign_idx');
    
    // Then remove the columns
    await queryInterface.removeColumn('Trips', 'startLocationId');
    await queryInterface.removeColumn('Trips', 'endLocationId');
  }
};
