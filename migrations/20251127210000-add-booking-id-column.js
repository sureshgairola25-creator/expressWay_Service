'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First, check if the column already exists
    const [results] = await queryInterface.sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = 'expressway' 
       AND TABLE_NAME = 'Bookings' 
       AND COLUMN_NAME = 'bookingId'`
    );

    // Only add the column if it doesn't exist
    if (results.length === 0) {
      await queryInterface.addColumn('Bookings', 'bookingId', {
        type: Sequelize.STRING,
        allowNull: true, // Temporarily allow null for existing records
        unique: true,
        comment: 'Custom booking ID in format ECXXXX'
      });

      // Generate booking IDs for existing records
      const [bookings] = await queryInterface.sequelize.query('SELECT id FROM Bookings');
      
      for (let i = 0; i < bookings.length; i++) {
        const bookingNumber = (i + 1).toString().padStart(4, '0');
        const bookingId = `EC${bookingNumber}`;
        
        await queryInterface.sequelize.query(
          'UPDATE Bookings SET bookingId = :bookingId WHERE id = :id',
          {
            replacements: { bookingId, id: bookings[i].id },
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
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Bookings', 'bookingId');
  }
};
