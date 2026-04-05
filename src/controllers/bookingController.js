// controllers/bookingController.js
// ─────────────────────────────────────────────────────────────────────────────

const bookingService = require('../services/bookingService');
const asyncHandler   = require('../../middleware/async');
const {
  validateSharingBooking,
  validateCabinBooking,
  validatePersonalizeBooking,
} = require('../middleware/validators/booking');

const bookingController = {

  // ── POST /bookings/sharing ─────────────────────────────────────────────────
  initiateSharingBooking: asyncHandler(async (req, res) => {
    validateSharingBooking(req.body);

    const result = await bookingService.initiateBooking({
      ...req.body,
      customerEmail: req.body.customerEmail,
      customerPhone: req.body.customerPhone,
    });

    res.status(201).json({
      success: true,
      message: 'Sharing cab booking initiated successfully',
      data: result,
    });
  }),

  // ── POST /bookings/cabin ───────────────────────────────────────────────────
  initiateCabinBooking: asyncHandler(async (req, res) => {
    validateCabinBooking(req.body);

    const result = await bookingService.initiateCabinBooking({
      ...req.body,
      customerEmail: req.body.customerEmail,
      customerPhone: req.body.customerPhone,
    });

    res.status(201).json({
      success: true,
      message: 'Cabin cab booking initiated successfully',
      data: result,
    });
  }),

  // ── POST /bookings/personalize ─────────────────────────────────────────────
  initiatePersonalizeBooking: asyncHandler(async (req, res) => {
    validatePersonalizeBooking(req.body);

    const result = await bookingService.initiatePersonalizeBooking({
      ...req.body,
      customerEmail: req.body.customerEmail,
      customerPhone: req.body.customerPhone,
    });

    res.status(201).json({
      success: true,
      message: 'Personalize cab booking initiated successfully',
      data: result,
    });
  }),

  // ── GET /bookings/my-bookings (user) ──────────────────────────────────────
  getUserBookings: asyncHandler(async (req, res) => {
    // userId comes from auth middleware (req.user.id) or query param
    const userId = req.user?.id || req.query.userId;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const bookings = await bookingService.getUserBookings(parseInt(userId));
    res.status(200).json({ success: true, data: bookings });
  }),

  // ── GET /bookings/:bookingId ───────────────────────────────────────────────
  getBookingDetails: asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const booking = await bookingService.getBookingDetails(parseInt(bookingId));
    res.status(200).json({ success: true, data: booking });
  }),

  // ── PATCH /bookings/:id/cancel ────────────────────────────────────────────
  cancelBooking: asyncHandler(async (req, res) => {
  const { id } = req.params;          // booking DB id (not bookingId string)
  const userId = req.body.userId || req.user?.id;
 
  const result = await bookingService.cancelBooking(parseInt(id), parseInt(userId));
 
  res.status(200).json({ success: true, data: result });
}),


  // ── GET /admin/bookings ───────────────────────────────────────────────────
  getBookingList: asyncHandler(async (req, res) => {
    const userId = req.query.userId ? parseInt(req.query.userId) : null;
    const { page = 1, limit = 10 } = req.query;
    const { data, pagination } = await bookingService.getBookingList(userId, { page, limit });
    res.status(200).json({ success: true, data, pagination });
  }),

  // ── PATCH /admin/bookings/:bookingId/payment-status ───────────────────────
  updatePaymentStatus: asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const { paidAmount, paymentStatus } = req.body;

    if (!paidAmount && !paymentStatus) {
      return res.status(400).json({
        success: false,
        message: 'paidAmount or paymentStatus is required'
      });
    }

    const result = await bookingService.updatePaymentStatus(
      parseInt(bookingId),
      { paidAmount, paymentStatus }
    );

    res.status(200).json({ success: true, message: result.message, data: result.booking });
  }),

  availablePersonalizeCabs : asyncHandler(async (req, res) => {
  try {

    const result =
      await bookingService.getAvailablePersonalizeCabs(req.query);

    res.json({
      success: true,
      data: result
    });

  } catch (err) {

    res.status(400).json({
      success: false,
      message: err.message
    });

  }
})
};

module.exports = bookingController;
// const bookingService = require('../services/bookingService');
// const paymentService = require('../services/paymentService');
// const asyncHandler = require('../../middleware/async');

// const bookingController = {
//   initiateBooking: asyncHandler(async (req, res) => {
//     const { journeyDate } = req.body;
    
//     if (!journeyDate) {
//       throw new Error('journeyDate is required in YYYY-MM-DD format');
//     }
    
//     const result = await bookingService.initiateBooking({
//       ...req.body,
//       customerEmail: req.body.customerEmail,
//       customerPhone: req.body.customerPhone,
//       journeyDate, // Pass journeyDate to service
//     });

//     res.status(201).json({
//       success: true,
//       message: 'Booking initiated successfully',
//       bookingId: result.id,
//       sessionId: result.paymentSessionId,
//     });
//   }),

//   createBooking: asyncHandler(async (req, res) => {
//     const booking = await bookingService.createBooking(req.body);
//     res.status(201).json({
//       success: true,
//       message: 'Booking created successfully',
//       data: booking,
//     });
//   }),

//   getBookingList: asyncHandler(async (req, res) => {
//     try {
//       // Get user ID from query params if provided, otherwise pass null to get all bookings
//       const userId = req.query.userId ? parseInt(req.query.userId) : null;
//       const bookings = await bookingService.getBookingList(userId);
//       res.status(200).json({
//         success: true,
//         data: bookings,
//       });
//     } catch (error) {
//       res.status(400).json({
//         success: false,
//         message: error.message || 'Failed to fetch bookings'
//       });
//     }
//   }),

//   getUserBookings: asyncHandler(async (req, res) => {
//     const { userId } = req.params;
//     const bookings = await bookingService.getUserBookings(parseInt(userId));
//     res.status(200).json({
//       success: true,
//       data: bookings,
//     });
//   }),

//   getBookingDetails: asyncHandler(async (req, res) => {
//     const { bookingId } = req.params;
//     const booking = await bookingService.getBookingDetails(parseInt(bookingId));
//     res.status(200).json({
//       success: true,
//       data: booking,
//     });
//   }),

//   cancelBooking: asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const result = await bookingService.cancelBooking(parseInt(id));
//     res.status(200).json({
//       success: true,
//       message: result.message,
//     });
//   }),
// };

// module.exports = bookingController;
