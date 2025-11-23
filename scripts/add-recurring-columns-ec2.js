const { Sequelize } = require('sequelize');
const config = require('../config/config.json').development;

async function addRecurringColumns() {
  const sequelize = new Sequelize({
    dialect: 'mysql',
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.database,
    logging: console.log,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  });

  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');

    // Check if is_recurring column exists
    const [results1] = await sequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = '${config.database}' 
      AND TABLE_NAME = 'Trips' 
      AND COLUMN_NAME = 'is_recurring'
    `);

    if (results1.length === 0) {
      await sequelize.query(`
        ALTER TABLE Trips 
        ADD COLUMN is_recurring TINYINT(1) NOT NULL DEFAULT 0
      `);
      console.log('✅ Added is_recurring column to Trips table');
    } else {
      console.log('ℹ️  is_recurring column already exists');
    }

    // Check if repeat_type column exists
    const [results2] = await sequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = '${config.database}'
      AND TABLE_NAME = 'Trips' 
      AND COLUMN_NAME = 'repeat_type'
    `);

    if (results2.length === 0) {
      await sequelize.query(`
        ALTER TABLE Trips 
        ADD COLUMN repeat_type ENUM('none', 'daily') NOT NULL DEFAULT 'none'
      `);
      console.log('✅ Added repeat_type column to Trips table');
    } else {
      console.log('ℹ️  repeat_type column already exists');
    }
    console.log('✅ Added repeat_type column to Trips table');

    console.log('✅ All columns added successfully');
  } catch (error) {
    console.error('❌ Error adding columns:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

addRecurringColumns();
