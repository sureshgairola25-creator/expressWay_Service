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
  isBooked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  }
}, {
  tableName: 'Seats',
  hooks: {
    beforeSave: (seat) => {
      // Keep status and isBooked in sync
      if (seat.changed('status')) {
        seat.isBooked = seat.status === 'booked';
      } else if (seat.changed('isBooked')) {
        seat.status = seat.isBooked ? 'booked' : 'available';
      }
    }
  }
});

module.exports = Seat;
