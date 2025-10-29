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
    defaultValue: [],
    field: 'pickup_points'
  },
  dropPoints: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
    field: 'drop_points'
  },
  carId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'car_id'
  },
  startLocationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'start_location_id',
    references: {
      model: 'StartLocations',
      key: 'id'
    }
  },
  endLocationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'end_location_id',
    references: {
      model: 'EndLocations',
      key: 'id'
    }
  },
  startTime: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'start_time',
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
    field: 'end_time',
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
  created_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'updated_at'
  }
}, {
  tableName: 'Trips',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
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
      if (trip.changed('startTime') && trip.startTime) {
        trip.startTime = toIST(trip.startTime);
      }
      if (trip.changed('endTime') && trip.endTime) {
        trip.endTime = toIST(trip.endTime);
      }
    }
  }
});

// Define associations
Trip.associate = (models) => {
  Trip.belongsTo(models.Car, { foreignKey: 'car_id' });
  Trip.belongsTo(models.StartLocation, { foreignKey: 'start_location_id', as: 'startLocation' });
  Trip.belongsTo(models.EndLocation, { foreignKey: 'end_location_id', as: 'endLocation' });
  Trip.belongsToMany(PickupPoint, {
    through: 'TripPickupPoints',
    as: 'pickupPointsData',
    foreignKey: 'trip_id'
  });
  
  Trip.belongsToMany(DropPoint, {
    through: 'TripDropPoints',
    as: 'dropPointsData',
    foreignKey: 'trip_id'
  });
  
  Trip.hasMany(models.Seat, { foreignKey: 'trip_id', as: 'seats' });
  Trip.hasMany(models.Booking, { foreignKey: 'trip_id' });
};

module.exports = Trip;