const { Sequelize, DataTypes } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

// Create Sequelize instance
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false
  }
);

const { QueryTypes } = Sequelize;

async function addIsBookedColumn() {
  try {
    // Check if the column already exists
    const [results] = await sequelize.query(
      `SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = '${sequelize.config.database}' 
       AND TABLE_NAME = 'Seats' 
       AND COLUMN_NAME = 'isBooked'`
    );

    if (results.length === 0) {
      // Add the column if it doesn't exist
      await sequelize.query(
        'ALTER TABLE Seats ADD COLUMN isBooked BOOLEAN NOT NULL DEFAULT FALSE',
        { type: QueryTypes.RAW }
      );
      console.log('Added isBooked column to Seats table');
      
      // Update existing records to set isBooked based on status
      await sequelize.query(
        'UPDATE Seats SET isBooked = (status = \'booked\')',
        { type: QueryTypes.UPDATE }
      );
      console.log('Updated existing records with isBooked values');
    } else {
      console.log('isBooked column already exists in Seats table');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error adding isBooked column:', error);
    process.exit(1);
  }
}

addIsBookedColumn();
