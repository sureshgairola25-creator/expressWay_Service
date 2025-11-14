const { sequelize } = require('../src/db/database');

async function addSelectedMealColumn() {
  try {
    // Check if the column already exists
    const [results] = await sequelize.query(
      `SHOW COLUMNS FROM Bookings LIKE 'selected_meal'`
    );
    
    if (results.length === 0) {
      // Add the column if it doesn't exist
      await sequelize.query(
        `ALTER TABLE Bookings 
         ADD COLUMN selected_meal JSON DEFAULT NULL COMMENT 'Selected meal information'`
      );
      console.log('✅ Successfully added selected_meal column to Bookings table');
    } else {
      console.log('ℹ️ selected_meal column already exists in Bookings table');
    }
    
    // Verify the column was added
    const [verifyResults] = await sequelize.query(
      `DESCRIBE Bookings selected_meal`
    );
    
    console.log('\nVerification:');
    console.table(verifyResults);
    
  } catch (error) {
    console.error('❌ Error adding selected_meal column:', error);
  } finally {
    await sequelize.close();
  }
}

addSelectedMealColumn();
