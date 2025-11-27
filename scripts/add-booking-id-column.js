const { sequelize } = require('../src/db/database');

async function addBookingIdColumn() {
  const t = await sequelize.transaction();
  
  try {
    console.log('Checking if bookingId column exists...');
    
    // Check if column exists
    const [results] = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = 'expressway' 
       AND TABLE_NAME = 'Bookings' 
       AND COLUMN_NAME = 'bookingId'`
    );

    if (results.length > 0) {
      console.log('bookingId column already exists');
      await t.rollback();
      return;
    }

    console.log('Adding bookingId column...');
    
    // Add the column as nullable first
    await sequelize.query(
      'ALTER TABLE Bookings ADD COLUMN bookingId VARCHAR(255) NULL COMMENT \'Custom booking ID in format ECXXXX\'',
      { transaction: t }
    );

    console.log('Generating booking IDs for existing records...');
    
    // Get all bookings
    const [bookings] = await sequelize.query(
      'SELECT id FROM Bookings ORDER BY id',
      { transaction: t }
    );

    // Generate and update booking IDs
    for (let i = 0; i < bookings.length; i++) {
      const bookingNumber = (i + 1).toString().padStart(4, '0');
      const bookingId = `EC${bookingNumber}`;
      
      await sequelize.query(
        'UPDATE Bookings SET bookingId = :bookingId WHERE id = :id',
        {
          replacements: { bookingId, id: bookings[i].id },
          type: sequelize.QueryTypes.UPDATE,
          transaction: t
        }
      );

      if (i > 0 && i % 100 === 0) {
        console.log(`Processed ${i} records...`);
      }
    }

    console.log('Making bookingId column NOT NULL and UNIQUE...');
    
    // Add unique constraint
    await sequelize.query(
      'ALTER TABLE Bookings ADD UNIQUE INDEX bookingId_UNIQUE (bookingId)',
      { transaction: t }
    );
    
    // Make column NOT NULL
    await sequelize.query(
      'ALTER TABLE Bookings MODIFY COLUMN bookingId VARCHAR(255) NOT NULL',
      { transaction: t }
    );

    await t.commit();
    console.log('Successfully added bookingId column and updated all records');
  } catch (error) {
    await t.rollback();
    console.error('Error:', error);
    process.exit(1);
  }
}

addBookingIdColumn()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
