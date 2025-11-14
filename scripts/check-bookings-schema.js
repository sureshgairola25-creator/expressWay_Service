const { sequelize } = require('../src/db/database');

async function checkBookingsSchema() {
  try {
    const [results] = await sequelize.query('DESCRIBE Bookings');
    console.log('Bookings Table Schema:');
    console.table(results);
    
    // Check if selected_meal column exists
    const hasSelectedMeal = results.some(column => column.Field === 'selected_meal');
    console.log(`\nSelected_meal column exists: ${hasSelectedMeal ? '✅ Yes' : '❌ No'}`);
    
    // Check for any other relevant columns
    const relevantColumns = results.map(col => ({
      Field: col.Field,
      Type: col.Type,
      Null: col.Null,
      Key: col.Key,
      Default: col.Default,
      Extra: col.Extra
    }));
    
    console.log('\nRelevant columns in Bookings table:');
    console.table(relevantColumns);
    
  } catch (error) {
    console.error('Error checking Bookings schema:', error);
  } finally {
    await sequelize.close();
  }
}

checkBookingsSchema();
