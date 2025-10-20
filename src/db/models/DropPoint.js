const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const DropPoint = sequelize.define('DropPoint', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  endLocationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  status: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'DropPoints',
});

module.exports = DropPoint;
