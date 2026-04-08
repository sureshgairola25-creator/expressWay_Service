const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { protect } = require('../../middleware/auth');

// ── User-authenticated payment routes ─────────────────────────────────────────
// Requires valid token so we can verify booking.userId === req.user.id
router.post('/create',               protect, paymentController.createOrder);
router.get('/success/:bookingId',    protect, paymentController.getBookingDetails);
router.get('/order-status/:orderId', protect, paymentController.getOrderStatus);

// ── Webhook from Cashfree — must remain public (no token) ────────────────────
// Cashfree signs the payload with a signature header instead; validate that
// inside paymentController.verifyPayment using the Cashfree webhook secret.
router.post('/verify', paymentController.verifyPayment);

module.exports = router;
