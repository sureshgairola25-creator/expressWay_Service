const { sequelize } = require('../src/db/database');

async function checkBookingsSchema() {
  try {
    // Check table structure
    const [tableInfo] = await sequelize.query('SHOW CREATE TABLE Bookings');
    console.log('Bookings Table Structure:');
    console.log(tableInfo[0]['Create Table']);
    
    // Check if created_at column exists
    const [createdAtCheck] = await sequelize.query(
      "SHOW COLUMNS FROM Bookings WHERE Field = 'created_at'"
    );
    
    console.log('\nCreated At Column Exists:', createdAtCheck.length > 0);
    
    // Check if createdAt column exists (camelCase)
    const [createdAtCamelCheck] = await sequelize.query(
      "SHOW COLUMNS FROM Bookings WHERE Field = 'createdAt'"
    );
    
    console.log('CreatedAt (camelCase) Column Exists:', createdAtCamelCheck.length > 0);
    
  } catch (error) {
    console.error('Error checking Bookings schema:', error);
  } finally {
    await sequelize.close();
  }
}

checkBookingsSchema();
