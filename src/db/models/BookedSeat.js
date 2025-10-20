const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const BookedSeat = sequelize.define('BookedSeat', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  bookingId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  tripId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  seatNumber: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  seatPrice: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  isCancelled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'BookedSeats',
});

// Associations (will be defined in index.js)
module.exports = BookedSeat;
