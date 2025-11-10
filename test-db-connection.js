const { Sequelize } = require('sequelize');
const env = process.env.NODE_ENV || 'development';
const config = require('./config/config.json')[env];

// Create a new connection
const sequelize = new Sequelize({
  dialect: 'mysql',
  host: config.host,
  port: config.port,
  username: config.username,
  password: config.password,
  database: config.database,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2'
    },
    supportBigNumbers: true,
    bigNumberStrings: true,
    typeCast: true,
    decimalNumbers: true
  },
  logging: console.log
});

async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connection has been established successfully.');
    
    // Test a simple query
    const [results] = await sequelize.query('SELECT 1+1 as result');
    console.log('✅ Test query result:', results[0]);
    
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

testConnection();
