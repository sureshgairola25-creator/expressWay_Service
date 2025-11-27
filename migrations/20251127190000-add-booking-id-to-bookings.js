'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Bookings', 'bookingId', {
      type: Sequelize.STRING,
      unique: true,
      allowNull: true,
      comment: 'Custom booking ID in format ECXXXX'
    });

    // Generate booking IDs for existing records
    const [results] = await queryInterface.sequelize.query('SELECT id FROM "Bookings" ORDER BY id');
    
    for (const [index, row] of results.entries()) {
      const bookingNumber = (index + 1).toString().padStart(4, '0');
      const bookingId = `EC${bookingNumber}`;
      
      await queryInterface.sequelize.query(
        'UPDATE "Bookings" SET "bookingId" = :bookingId WHERE id = :id',
        {
          replacements: { bookingId, id: row.id },
          type: Sequelize.QueryTypes.UPDATE
        }
      );
    }

    // Make the column not null after populating all records
    await queryInterface.changeColumn('Bookings', 'bookingId', {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Bookings', 'bookingId');
  }
};
