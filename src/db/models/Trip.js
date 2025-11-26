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
    // get() {
    //   const value = this.getDataValue('startTime');
    //   return value ? toIST(value) : null;
    // }
    // Removed setter to prevent timezone conversion on save
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'end_time',
    // get() {
    //   const value = this.getDataValue('endTime');
    //   return value ? toIST(value) : null;
    // }
    // Removed setter to prevent timezone conversion on save
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
  },
  isRecurring: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_recurring',
    comment: 'Indicates if this is a recurring trip'
  },
  repeatType: {
    type: DataTypes.ENUM('none', 'daily'),
    allowNull: false,
    defaultValue: 'none',
    field: 'repeat_type',
    comment: 'Type of repetition for the trip (none, daily)'
  }
}, {
  tableName: 'Trips',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true,
  // hooks: {
  //   beforeCreate: (trip) => {
  //     if (trip.startTime) {
  //       trip.startTime = toIST(trip.startTime);
  //     }
  //     if (trip.endTime) {
  //       trip.endTime = toIST(trip.endTime);
  //     }
  //   },
  //   beforeUpdate: (trip) => {
  //     if (trip.changed('startTime') && trip.startTime) {
  //       trip.startTime = toIST(trip.startTime);
  //     }
  //     if (trip.changed('endTime') && trip.endTime) {
  //       trip.endTime = toIST(trip.endTime);
  //     }
  //   }
  // }
});

// Define associations
Trip.associate = (models) => {
  Trip.belongsTo(models.Car, { 
    foreignKey: 'carId',
    as: 'car'
  });
  
  Trip.belongsTo(models.StartLocation, { 
    foreignKey: 'startLocationId', 
    as: 'startLocation' 
  });
  
  Trip.belongsTo(models.EndLocation, { 
    foreignKey: 'endLocationId', 
    as: 'endLocation' 
  });
  
  // These many-to-many associations are now defined in index.js
  // to avoid circular dependencies and ensure proper loading order
  
  Trip.hasMany(models.Seat, { 
    foreignKey: 'tripId', 
    as: 'seats' 
  });
  
  Trip.hasMany(models.Booking, { 
    foreignKey: 'tripId',
    as: 'bookings'
  });
  
  Trip.hasMany(models.SeatPricing, {
    foreignKey: 'tripId',
    as: 'seatPricings'
  });
};

// Instance method to get review statistics
Trip.prototype.getReviewStats = async function() {
  const reviews = await this.getReviews({
    attributes: ['rating'],
    raw: true
  });

  const reviewCount = reviews.length;
  const averageRating = reviewCount > 0 
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount
    : 0;

  return {
    reviewCount,
    averageRating: parseFloat(averageRating.toFixed(1))
  };
};

module.exports = Trip;