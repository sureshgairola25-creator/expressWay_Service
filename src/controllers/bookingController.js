const bookingService = require('../services/bookingService');
const paymentService = require('../services/paymentService');
const asyncHandler = require('../../middleware/async');

const bookingController = {
  initiateBooking: asyncHandler(async (req, res) => {
    const booking = await bookingService.initiateBooking(req.body);

    // Generate payment link
    const paymentResult = await paymentService.createOrder({
      orderAmount: booking.totalAmount,
      customerEmail: req.body.customerEmail || 'customer@example.com', // Should come from user
      customerPhone: req.body.customerPhone || '9999999999',
      bookingId: booking.id,
    });

    res.status(201).json({
      success: true,
      message: 'Booking initiated successfully',
      bookingId: booking.id,
      sessionId: paymentResult.payment_session_id,
    });
  }),

  createBooking: asyncHandler(async (req, res) => {
    const booking = await bookingService.createBooking(req.body);
    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: booking,
    });
  }),

  getUserBookings: asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const bookings = await bookingService.getUserBookings(parseInt(userId));
    res.status(200).json({
      success: true,
      data: bookings,
    });
  }),

  getBookingDetails: asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const booking = await bookingService.getBookingDetails(parseInt(bookingId));
    res.status(200).json({
      success: true,
      data: booking,
    });
  }),

  cancelBooking: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await bookingService.cancelBooking(parseInt(id));
    res.status(200).json({
      success: true,
      message: result.message,
    });
  }),
};

module.exports = bookingController;
