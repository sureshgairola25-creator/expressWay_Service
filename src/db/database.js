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
// console.log('Database config:', JSON.stringify(config, null, 2));

// Base configuration
const sequelizeConfig = {
  host: config.host,
  port: config.port || 3306,
  username: config.username,
  password: config.password,
  database: config.database,
  dialect: "mysql",
  timezone: "+05:30",
  // Disable SSL for development
  ssl: false,
  // Retry configuration
  retry: {
    max: 5,
    timeout: 60000,
    match: [
      /SequelizeConnectionError/,
      /SequelizeConnectionRefusedError/,
      /SequelizeHostNotFoundError/,
      /SequelizeHostNotReachableError/,
      /SequelizeInvalidConnectionError/,
      /SequelizeConnectionTimedOutError/
    ]
  },
  // Use dialectOptions from config or set defaults
  dialectOptions: {
    ssl: false,
    connectTimeout: 10000,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
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

// Test the connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection has been established successfully.');
    return true;
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    return false;
  }
};

// For backward compatibility with models
sequelize.Sequelize = Sequelize;
sequelize.DataTypes = DataTypes;

// Export both default and named exports
module.exports = sequelize;
module.exports.sequelize = sequelize;
module.exports.Sequelize = Sequelize;
module.exports.DataTypes = DataTypes;
module.exports.testConnection = testConnection;