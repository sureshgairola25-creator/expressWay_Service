const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Route = sequelize.define('Route', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  startLocationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'StartLocations', // table name of StartLocation
      key: 'id',
    },
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  },
  endLocationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'EndLocations', // table name of EndLocation
      key: 'id',
    },
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  },
  status: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'Routes',
  timestamps: true, // createdAt, updatedAt
});

module.exports = Route;
