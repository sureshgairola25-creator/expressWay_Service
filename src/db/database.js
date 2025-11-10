const { Sequelize } = require("sequelize");
const dotenv = require("dotenv");
const { toIST } = require("../utils/dateUtils");
const { DataTypes } = require('sequelize');
const fs = require('fs');
const path = require('path');

dotenv.config();

// Load config based on environment
const env = process.env.NODE_ENV || 'development';
const config = require('../../config/config.json')[env];

// Read SSL certificate
const sslCert = fs.readFileSync(path.join(__dirname, '../../config/isrgrootx1.pem'));

const sequelizeConfig = {
  host: config.host,
  port: config.port || 4000,
  username: config.username,
  password: config.password,
  database: config.database,
  dialect: "mysql",
  timezone: "+05:30",
  // Retry configuration
  retry: {
    max: 5, // Maximum number of retries
    timeout: 60000, // Timeout in ms
    match: [
      /SequelizeConnectionError/,
      /SequelizeConnectionRefusedError/,
      /SequelizeHostNotFoundError/,
      /SequelizeHostNotReachableError/,
      /SequelizeInvalidConnectionError/,
      /SequelizeConnectionTimedOutError/
    ],
  },
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      ca: sslCert.toString()
    },
    connectTimeout: 10000, // 10 seconds timeout for connection
    dateStrings: true,
    typeCast: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    // Set SQL mode to handle only_full_group_by
    query: { 
      sql: 'SET SESSION sql_mode=(SELECT REPLACE(@@sql_mode,\'ONLY_FULL_GROUP_BY\',\'\'));' 
    },
    typeCast: function (field, next) {
      if (field.type === 'DATETIME' || field.type === 'TIMESTAMP') {
        const value = field.string();
        if (value === '0000-00-00 00:00:00' || value === null) {
          return null;
        }
        return new Date(value);
      }
      return next();
    }
  },
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  logging: false
};

// Create Sequelize instance with the configuration
const sequelize = new Sequelize(sequelizeConfig);

// Test the connection with retries
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

// const testConnection = async (retryCount = 0) => {
//   try {
//     await sequelize.authenticate();
//     console.log('✅ Database connection has been established successfully.');
    
//     // Sync all models with minimal logging
//     try {
//       await sequelize.sync({
//         alter: false,  // Disable altering tables
//         force: false,  // Don't drop tables
//         logging: false, // Disable all SQL logging
//         hooks: false   // Disable hooks logging
//       });
//       console.log('✅ Database connected');
//     } catch (syncError) {
//       console.error('❌ Database sync error');
//       if (process.env.NODE_ENV === 'development') {
//         console.error(syncError);
//       }
//     }
//   } catch (error) {
//     if (retryCount < MAX_RETRIES) {
//       console.log(`⚠️ Connection attempt ${retryCount + 1} failed. Retrying in ${RETRY_DELAY/1000} seconds...`);
//       await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
//       return testConnection(retryCount + 1);
//     }
//     console.error('❌ Unable to connect to the database after multiple attempts:', error);
//     console.warn("⚠️ Continuing with existing database schema...");
//   }
// };

// Initialize the database connection
// testConnection().catch(console.error);

module.exports = sequelize;
