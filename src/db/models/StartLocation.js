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
  locationType: {
  type:         DataTypes.ENUM('shared', 'personalized', 'all'),
  defaultValue: 'shared',
  field:        'location_type',
},
}, {
  tableName: 'StartLocations',
  timestamps: true,
  underscored: true
});

module.exports = StartLocation;
