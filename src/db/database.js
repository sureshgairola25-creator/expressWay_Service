const { Sequelize } = require("sequelize");
const dotenv = require("dotenv");
const { toIST } = require("../utils/dateUtils");
const { DataTypes } = require('sequelize');

dotenv.config();

// Enable NO_ZERO_DATE mode for MySQL to handle '0000-00-00' dates
const sequelizeConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  dialect: "mysql",
  timezone: "+05:30",
  dialectOptions: {
    dateStrings: true,
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
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  sequelizeConfig
);

// Test connection
(async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ MySQL connected successfully!");
  } catch (error) {
    console.error("❌ MySQL connection failed:", error);
    process.exit(1);
  }
})();

// Sync all models with the database
(async () => {
  try {
    // Use sync with alter: true but prevent dropping columns
    await sequelize.sync({ 
      alter: { 
        drop: false,  // Don't drop columns
        // Add any other alter options if needed
      },
      // Skip creating the table if it already exists
      // This prevents the 'table already exists' error
      // but still allows for column additions/modifications
      // through the alter option above
      // @ts-ignore - force is not in the type definition but works
      force: false,   // Don't drop tables
      // @ts-ignore - match is not in the type definition but works
      match: /^[^_].*$/ // Don't sync sequelize meta tables
    });
    
    console.log("✅ Database synchronized successfully!");
  } catch (error) {
    console.error("❌ Database sync failed:", error);
    // Try to continue even if sync fails
    console.warn("⚠️ Continuing with existing database schema...");
  }
})();

module.exports = sequelize;
