// const express = require('express');
// const bookingController = require('../controllers/bookingController');

// const router = express.Router();

// // Create a new booking (initiate with payment link)
// router.post('/initiate', bookingController.initiateBooking);

// // Create a new booking (legacy)
// router.post('/create', bookingController.createBooking);

// // Get all bookings or filter by user ID
// router.get('/list', bookingController.getBookingList);

// // Get bookings for a specific user
// router.get('/:userId', bookingController.getUserBookings);

// // Get booking details
// router.get('/details/:bookingId', bookingController.getBookingDetails);

// // Cancel a booking
// router.put('/:id/cancel', bookingController.cancelBooking);

// module.exports = router;

// routes/bookingRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
 
const express = require('express');
const router  = express.Router();
const bookingController = require('../controllers/bookingController');
// const { authenticate, isAdmin } = require('../../middleware/auth'); // uncomment when auth is ready
 
// ── User booking routes ───────────────────────────────────────────────────────
 
// Create bookings — one endpoint per cab type
router.post('/sharing',     /* authenticate, */ bookingController.initiateSharingBooking);
router.post('/cabin',       /* authenticate, */ bookingController.initiateCabinBooking);
router.post('/personalize', /* authenticate, */ bookingController.initiatePersonalizeBooking);
 
// User's own bookings
router.get('/my-bookings',      /* authenticate, */ bookingController.getUserBookings);
router.get('/:bookingId',       /* authenticate, */ bookingController.getBookingDetails);
router.patch('/:id/cancel',     /* authenticate, */ bookingController.cancelBooking);
 
// ── Admin routes ──────────────────────────────────────────────────────────────
router.get('/admin/list',                              /* isAdmin, */ bookingController.getBookingList);
router.patch('/admin/:bookingId/payment-status',       /* isAdmin, */ bookingController.updatePaymentStatus);

router.get(
  '/personalizeCabs',
  bookingController.availablePersonalizeCabs
);
 
module.exports = router;

