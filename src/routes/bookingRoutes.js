const express = require('express');
const router  = express.Router();
const bookingController = require('../controllers/bookingController');
const { protect, authorize } = require('../../middleware/auth');

// ── User booking routes (require valid token) ─────────────────────────────────
router.post('/sharing',     protect, bookingController.initiateSharingBooking);
router.post('/cabin',       protect, bookingController.initiateCabinBooking);
router.post('/personalize', protect, bookingController.initiatePersonalizeBooking);

router.get('/verify-payment/:orderId', bookingController.verifyPayment);


router.get('/my-bookings',        protect, bookingController.getUserBookings);
router.get('detail/:bookingId',   protect, bookingController.getBookingDetails);
router.patch('/:id/cancel',       protect, bookingController.cancelBooking);

// ── Admin booking routes (require admin role) ─────────────────────────────────
router.get('/list',                             protect, authorize('admin'), bookingController.getBookingList);
router.patch('/admin/:bookingId/payment-status', protect, authorize('admin'), bookingController.updatePaymentStatus);

// ── Personalize cab availability (public — used during trip search) ───────────
router.get('/personalizeCabs', bookingController.availablePersonalizeCabs);

module.exports = router;
