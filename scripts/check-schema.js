const { sequelize } = require('../src/db/database');

async function checkSchema() {
  try {
    // Get table information
    const [tables] = await sequelize.query('SHOW TABLES');
    console.log('Tables in database:', tables);

    // Check Bookings table structure
    const [bookingColumns] = await sequelize.query('SHOW COLUMNS FROM Bookings');
    console.log('\nBookings table columns:');
    console.table(bookingColumns);

    // Check ENUM values for booking_status
    const [enumValues] = await sequelize.query(
      "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Bookings' AND COLUMN_NAME = 'booking_status'"
    );
    console.log('\nBooking status ENUM values:', enumValues[0]?.COLUMN_TYPE);

  } catch (error) {
    console.error('Error checking schema:', error);
  } finally {
    await sequelize.close();
  }
}

checkSchema();
