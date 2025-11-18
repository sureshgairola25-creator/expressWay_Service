// Routes
const user = require('./user-route');
const root = require('./root-route');
const badge = require('./admin');
const route = require('./routeRoutes');
const location = require('./location');
const car = require('./carRoutes');
const trip = require('./tripRoutes');
const seat = require('./seatRoutes');
const otp = require('./otpRoutes');
const payment = require('./paymentRoutes');
const booking = require('./bookingRoutes');
const coupon = require('./couponRoutes');

module.exports = {
  root,
  user,
  badge,
  route,
  location,
  car,
  trip,
  seat,
  otp,
  payment,
  booking,
  coupon,
  user
};
