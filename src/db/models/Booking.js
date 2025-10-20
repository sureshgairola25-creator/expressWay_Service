const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Booking = sequelize.define('Booking', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  tripId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  seats: {
    type: DataTypes.JSON,
    allowNull: false,
  },
  totalAmount: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  paymentStatus: {
    type: DataTypes.ENUM('pending', 'completed', 'failed'),
    defaultValue: 'pending',
  },
  bookingStatus: {
    type: DataTypes.ENUM('active', 'initiated', 'cancelled', 'completed'),
    defaultValue: 'active',
  },
  // Future-proofing fields (commented out for now)
  // transactionId: {
  //   type: DataTypes.STRING,
  // },
  // couponId: {
  //   type: DataTypes.INTEGER,
  // },
  // passengerDetails: {
  //   type: DataTypes.JSON,
  // },
}, {
  tableName: 'Bookings',
});

// Associations (will be defined in index.js)
module.exports = Booking;
