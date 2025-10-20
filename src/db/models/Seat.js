const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Seat = sequelize.define('Seat', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  seatNumber: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  seatType: {
    type: DataTypes.STRING,
  },
  price: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('available', 'booked'),
    defaultValue: 'available',
  },
}, {
  tableName: 'Seats',
});

module.exports = Seat;
