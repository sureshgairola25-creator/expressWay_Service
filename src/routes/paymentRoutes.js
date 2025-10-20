const express = require('express');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

// @route   POST /api/payment/create
// @desc    Create a new Cashfree payment order
// @access  Public (should be protected in a real app)
router.post('/create', paymentController.createOrder);

// @route   POST /api/payment/verify
// @desc    Verify a Cashfree payment (webhook)
// @access  Public (webhook from Cashfree)
router.post('/verify', paymentController.verifyPayment);

// @route   GET /api/payment/success/:bookingId
// @desc    Get final ticket details after successful payment
// @access  Public (should be protected in a real app)
router.get('/success/:bookingId', paymentController.getBookingDetails);

module.exports = router;
