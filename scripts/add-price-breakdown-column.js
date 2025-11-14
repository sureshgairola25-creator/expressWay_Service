const { sequelize } = require('../src/db/database');

async function addPriceBreakdownColumn() {
  try {
    // Check if the column already exists
    const [results] = await sequelize.query(
      "SHOW COLUMNS FROM Bookings LIKE 'price_breakdown'"
    );
    
    if (results.length === 0) {
      console.log('Adding price_breakdown column to Bookings table...');
      await sequelize.query(
        'ALTER TABLE Bookings ADD COLUMN price_breakdown JSON DEFAULT (JSON_OBJECT())'
      );
      console.log('Successfully added price_breakdown column to Bookings table');
    } else {
      console.log('price_breakdown column already exists in Bookings table');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error adding price_breakdown column:', error);
    process.exit(1);
  }
}

addPriceBreakdownColumn();
