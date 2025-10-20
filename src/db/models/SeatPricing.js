const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const SeatPricing = sequelize.define('SeatPricing', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tripId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  seatType: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  seatNumber: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  price: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  isBooked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'SeatPricing',
});

// Define association
SeatPricing.belongsTo(require('./Trip'), { foreignKey: 'tripId' });

module.exports = SeatPricing;
