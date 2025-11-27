const { sequelize } = require('../src/db/database');

async function checkBookingColumns() {
  try {
    const [results] = await sequelize.query(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = 'Bookings'
       ORDER BY ORDINAL_POSITION`
    );
    
    console.log('Columns in Bookings table:');
    console.table(results);
    
    // Check if bookingId exists
    const hasBookingId = results.some(col => col.COLUMN_NAME === 'bookingId');
    console.log(`\nBooking ID column exists: ${hasBookingId ? '✅ Yes' : '❌ No'}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error checking columns:', error);
    process.exit(1);
  }
}

checkBookingColumns();
