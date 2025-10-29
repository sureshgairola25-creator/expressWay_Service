'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add startLocationId column
    await queryInterface.addColumn('Trips', 'startLocationId', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'StartLocations',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    // Add endLocationId column
    await queryInterface.addColumn('Trips', 'endLocationId', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'EndLocations',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the foreign key constraints first
    await queryInterface.removeConstraint('Trips', 'Trips_startLocationId_foreign_idx');
    await queryInterface.removeConstraint('Trips', 'Trips_endLocationId_foreign_idx');
    
    // Then remove the columns
    await queryInterface.removeColumn('Trips', 'startLocationId');
    await queryInterface.removeColumn('Trips', 'endLocationId');
  }
};
