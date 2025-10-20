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
    unique: true,
  },
  status: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'StartLocations',
});

module.exports = StartLocation;
