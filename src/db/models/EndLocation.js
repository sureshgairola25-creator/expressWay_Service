const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const EndLocation = sequelize.define('EndLocation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    // Removed unique constraint completely to avoid MySQL key limit issues
    // If uniqueness is needed, handle it in application logic
  },
  startLocationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  status: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'EndLocations',
});

module.exports = EndLocation;
