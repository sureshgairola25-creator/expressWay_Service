const { Sequelize } = require("sequelize");
const dotenv = require("dotenv");

dotenv.config();

// Create Sequelize instance
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
    dialectOptions: {
      // ssl: {
      //   require: true,
      //   rejectUnauthorized: false,
      // },
    },
    logging: false, // disable SQL logs
  }
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

module.exports = sequelize;
