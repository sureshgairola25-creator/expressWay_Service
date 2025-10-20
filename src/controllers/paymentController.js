const paymentService = require('../services/paymentService');
const asyncHandler = require('../../middleware/async');

const paymentController = {
  createOrder: asyncHandler(async (req, res) => {
    const { order_amount, customer_details, bookingId } = req.body;

    const result = await paymentService.createOrder({
      orderAmount: order_amount,
      customerEmail: customer_details.customer_email,
      customerPhone: customer_details.customer_phone,
      bookingId,
    });

    res.status(200).json({ success: true, data: result });
  }),

  verifyPayment: asyncHandler(async (req, res) => {
    const signature = req.headers['x-webhook-signature'];
    const result = await paymentService.verifyPayment(signature, req.body);
    res.status(200).json({ success: true, data: result });
  }),

  getBookingDetails: asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const result = await paymentService.getBookingDetails(bookingId);
    res.status(200).json({ success: true, data: result });
  }),
};

module.exports = paymentController;
