const express = require('express');
const seatPricing = require('./routes/seatPricingRoutes');
const booking = require('./routes/bookingRoutes');
const payment = require('./routes/paymentRoutes');
const location = require('./routes/location');
const route = require('./routes/routeRoutes');
const car = require('./routes/carRoutes');
const trip = require('./routes/tripRoutes');

const router = express.Router();

// router.use('/', root);

// router.use('/user', user);
// router.use('/admin', admin);
// API routes
router.use('/route', route);
router.use('/locations', location);
router.use('/cars', car);
router.use('/trips', trip);
router.use('/seat-pricing', seatPricing);
router.use('/booking', booking);
router.use('/payment', payment);

module.exports = router;
