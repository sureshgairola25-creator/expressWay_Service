const { DataTypes } = require('sequelize');
const sequelize = require('../database');
const { toIST } = require('../../utils/dateUtils');

const Trip = sequelize.define('Trip', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  pickupPoints: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: []
  },
  dropPoints: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: []
  },
  carId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  startTime: {
    type: DataTypes.DATE,
    allowNull: false,
    get() {
      const value = this.getDataValue('startTime');
      return value ? toIST(value) : null;
    },
    set(value) {
      this.setDataValue('startTime', value ? toIST(value) : null);
    }
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: false,
    get() {
      const value = this.getDataValue('endTime');
      return value ? toIST(value) : null;
    },
    set(value) {
      this.setDataValue('endTime', value ? toIST(value) : null);
    }
  },
  duration: {
    type: DataTypes.STRING,
  },
  status: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  meals: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  tableName: 'Trips',
  timestamps: true,
  underscored: true,
  hooks: {
    beforeCreate: (trip) => {
      if (trip.startTime) {
        trip.startTime = toIST(trip.startTime);
      }
      if (trip.endTime) {
        trip.endTime = toIST(trip.endTime);
      }
    },
    beforeUpdate: (trip) => {
      // Update timestamps to IST on update
      if (trip.changed('startTime') && trip.startTime) {
        trip.startTime = toIST(trip.startTime);
      }
      if (trip.changed('endTime') && trip.endTime) {
        trip.endTime = toIST(trip.endTime);
      }
    }
  }
});

// No direct associations - using JSON arrays of IDs instead

module.exports = Trip;
