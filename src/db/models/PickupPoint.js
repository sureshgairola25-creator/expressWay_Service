const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const PickupPoint = sequelize.define('PickupPoint', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
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
  tableName: 'PickupPoints',
  timestamps: true,
  underscored: true
});

module.exports = PickupPoint;
