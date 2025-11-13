const sequelize = require('../database');
const StartLocation = require('./StartLocation');
const PickupPoint = require('./PickupPoint');
const EndLocation = require('./EndLocation');
const DropPoint = require('./DropPoint');
const Route = require('./Route');
const Car = require('./Car');
const Trip = require('./Trip');
const Seat = require('./Seat');
const Booking = require('./Booking');
const BookedSeat = require('./BookedSeat');
const SeatPricing = require('./SeatPricing');
const User = require('./User');
const CouponModel = require('./coupon');
const Coupon = CouponModel(sequelize, require('sequelize').DataTypes);

// Associations
StartLocation.hasMany(PickupPoint, { foreignKey: 'startLocationId' });
PickupPoint.belongsTo(StartLocation, { foreignKey: 'startLocationId' });

StartLocation.hasMany(EndLocation, { foreignKey: 'startLocationId' });
EndLocation.belongsTo(StartLocation, { foreignKey: 'startLocationId' });

EndLocation.hasMany(DropPoint, { foreignKey: 'endLocationId' });
DropPoint.belongsTo(EndLocation, { foreignKey: 'endLocationId' });

StartLocation.hasMany(Route, { foreignKey: 'startLocationId' });
EndLocation.hasMany(Route, { foreignKey: 'endLocationId' });
Route.belongsTo(StartLocation, { foreignKey: 'startLocationId' });
Route.belongsTo(EndLocation, { foreignKey: 'endLocationId' });

// Trip Associations
Car.hasMany(Trip, { foreignKey: 'carId' });
Trip.belongsTo(Car, { foreignKey: 'carId' });

// Trip-StartLocation Association
StartLocation.hasMany(Trip, { 
  foreignKey: 'startLocationId',
  as: 'tripsFrom'
});
Trip.belongsTo(StartLocation, { 
  foreignKey: 'startLocationId',
  as: 'startLocation'
});

// Trip-EndLocation Association
EndLocation.hasMany(Trip, { 
  foreignKey: 'endLocationId',
  as: 'tripsTo'
});
Trip.belongsTo(EndLocation, { 
  foreignKey: 'endLocationId',
  as: 'endLocation'
});

// Trip-Seat Association
Trip.hasMany(Seat, { 
  foreignKey: 'tripId',
  as: 'seats'  // Explicitly set the alias to 'seats'
});
Seat.belongsTo(Trip, { 
  foreignKey: 'tripId',
  as: 'trip'  // Keep the reverse association as 'trip' for clarity
});

// Remove these if not needed as we're using JSON arrays now
// PickupPoint.hasMany(Trip, { foreignKey: 'pickupPointId' });
// Trip.belongsTo(PickupPoint, { foreignKey: 'pickupPointId' });
// DropPoint.hasMany(Trip, { foreignKey: 'dropPointId' });
// Trip.belongsTo(DropPoint, { foreignKey: 'dropPointId' });

// Trip.belongsToMany(PickupPoint, {
//   through: "TripPickupPoints",
//   as: "pickupPointsData",
//   foreignKey: "trip_id"
// });

// Trip.belongsToMany(DropPoint, {
//   through: "TripDropPoints",
//   as: "dropPointsData",
//   foreignKey: "trip_id"
// });

Trip.hasMany(SeatPricing, { foreignKey: 'tripId', onDelete: 'CASCADE' });
SeatPricing.belongsTo(Trip, { foreignKey: 'tripId' });

Trip.hasMany(Booking, { foreignKey: 'tripId', onDelete: 'CASCADE' });
Booking.belongsTo(Trip, { foreignKey: 'tripId' });

Booking.hasMany(BookedSeat, { foreignKey: 'bookingId', onDelete: 'CASCADE' });
BookedSeat.belongsTo(Booking, { foreignKey: 'bookingId' });

BookedSeat.belongsTo(Trip, { foreignKey: 'tripId', onDelete: 'CASCADE' });

// User-Booking Associations
User.hasMany(Booking, { foreignKey: 'userId' });
Booking.belongsTo(User, { foreignKey: 'userId' });

const db = {
  sequelize,
  StartLocation,
  PickupPoint,
  EndLocation,
  DropPoint,
  Route,
  Car,
  Trip,
  Seat,
  SeatPricing,
  Booking,
  BookedSeat,
  User,
  Coupon
};

module.exports = db;
