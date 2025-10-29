const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const StartLocation = sequelize.define('StartLocation', {
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
  status: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'StartLocations',
  timestamps: true,
  underscored: true
});

module.exports = StartLocation;
