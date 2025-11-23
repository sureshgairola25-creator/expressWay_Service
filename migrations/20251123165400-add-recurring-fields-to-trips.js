'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Trips', 'isRecurring', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_recurring'
    });

    await queryInterface.addColumn('Trips', 'repeatType', {
      type: Sequelize.ENUM('none', 'daily'),
      allowNull: false,
      defaultValue: 'none',
      field: 'repeat_type'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Trips', 'isRecurring');
    await queryInterface.removeColumn('Trips', 'repeatType');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Trips_repeatType";');
  }
};
