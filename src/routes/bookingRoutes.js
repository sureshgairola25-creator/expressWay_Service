const express = require('express');
const bookingController = require('../controllers/bookingController');

const router = express.Router();

// Create a new booking (initiate with payment link)
router.post('/initiate', bookingController.initiateBooking);

// Create a new booking (legacy)
router.post('/create', bookingController.createBooking);

// Get all bookings or filter by user ID
router.get('/list', bookingController.getBookingList);

// Get bookings for a specific user
router.get('/:userId', bookingController.getUserBookings);

// Get booking details
router.get('/details/:bookingId', bookingController.getBookingDetails);

// Cancel a booking
router.put('/:id/cancel', bookingController.cancelBooking);

module.exports = router;
