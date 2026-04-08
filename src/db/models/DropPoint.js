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
  cabType: {
    type: DataTypes.ENUM('sharing', 'cabin', 'personalize', 'all'),
    defaultValue: 'all',
    field: 'cab_type',
    comment: 'Namespace: sharing+cabin share one namespace, personalize is separate',
  },
}, {
  tableName: 'DropPoints',
  timestamps: true,
  underscored: true,
  // Let the database configuration handle the timestamp columns
  createdAt: false,
  updatedAt: false,
});

module.exports = DropPoint;
