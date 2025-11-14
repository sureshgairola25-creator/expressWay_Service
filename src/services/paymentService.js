const axios = require('axios');
const crypto = require('crypto');
const { BadRequest, Unauthorized, NotFound } = require('http-errors');
const { Booking, SeatPricing } = require('../db/models');

const cashfreeApiUrl = process.env.CASHFREE_API_URL;
const cashfreeApiKey = process.env.CASHFREE_API_KEY;
const cashfreeApiSecret = process.env.CASHFREE_API_SECRET;
const cashfreeApiVersion = process.env.CASHFREE_API_VERSION;

// Map Cashfree statuses to internal statuses
const mapPaymentStatus = (status) => {
  const statusMap = {
    'PAID': 'paid',
    'SUCCESS': 'paid',
    'FAILED': 'failed',
    'CANCELLED': 'failed',
    'PENDING': 'pending',
    'PROCESSING': 'pending'
  };
  return statusMap[status] || status.toLowerCase();
};

const paymentService = {
  createOrder: async (orderDetails) => {
    const { orderAmount,customer_id, customerEmail, customerPhone, bookingId } = orderDetails;

    if (!orderAmount || !customerPhone || !bookingId) {
      throw new BadRequest('Missing required payment details: orderAmount, customerPhone, and bookingId are mandatory.');
    }

    const url = `${cashfreeApiUrl}/orders`;
    const headers = {
      'x-api-version': cashfreeApiVersion,
      'x-client-id': cashfreeApiKey,
      'x-client-secret': cashfreeApiSecret,
      'Content-Type': 'application/json',
    };

    const data = {
      order_amount: orderAmount,
      order_currency: 'INR',
      order_id: `ORDER_${bookingId}_${Date.now()}`,
      customer_details: {
        customer_id: `CUST_${customer_id}`,
        customer_phone: customerPhone,
        ...(customerEmail && { customer_email: customerEmail }),
      },
      order_meta: {
        return_url: `${process.env.CLIENT_URL}/bookings`,
      },
    };

    try {
      const response = await axios.post(url, data, { headers });
      return response.data;
    } catch (error) {
      console.error('Cashfree API Error:', error.response ? error.response.data : error.message);
      throw new BadRequest('Failed to create payment order with Cashfree');
    }
  },

  verifyPayment: async (signature, body) => {
    try {
      const orderId = body.data.order.order_id;
      // Extract bookingId from orderId (e.g., "ORDER_123_TIMESTAMP")
      const bookingId = orderId.split('_')[1];

      const booking = await Booking.findByPk(bookingId);
      if (!booking) {
        throw new NotFound('Booking not found for this order');
      }

      if (body.data.order.order_status === 'PAID') {
        // Payment successful
        booking.paymentStatus = 'completed';
        booking.bookingStatus = 'confirmed';
        booking.paymentMode = body.data.payment.payment_method;
        booking.transactionId = body.data.payment.cf_payment_id;
      } else {
        // Payment failed
        booking.paymentStatus = 'failed';
        booking.bookingStatus = 'cancelled';

        // Release locked seats
        await SeatPricing.update(
          { isBooked: false },
          { where: { tripId: booking.tripId, seatNumber: booking.seats } }
        );
      }

      await booking.save();
      return { status: 'ok' };

    } catch (error) {
      console.error('Webhook processing error:', error);
      throw new BadRequest('Webhook processing failed');
    }
  },

  getBookingDetails: async (bookingId) => {
    const { Booking, Trip, BookedSeat, Car, StartLocation, EndLocation } = require('../db/models');

    const booking = await Booking.findByPk(bookingId, {
      include: [
        {
          model: Trip,
          include: [
            {
              model: Car,
              attributes: ['carName', 'carType', 'totalSeats'],
            },
            {
              model: StartLocation,
              as: 'startLocation',
              attributes: ['name'],
            },
            {
              model: EndLocation,
              as: 'endLocation',
              attributes: ['name'],
            },
          ],
        },
        {
          model: BookedSeat,
          attributes: ['seatNumber', 'seatPrice', 'isCancelled'],
        },
      ],
      attributes: ['id', 'seats', 'totalAmount', 'paymentStatus', 'bookingStatus', 'createdAt'],
    });

    if (!booking) {
      throw new NotFound('Booking not found');
    }

    return booking;
  },
  
  getOrderStatus: async (orderId) => {
    try {
      if (!orderId) {
        throw new BadRequest('Order ID is required');
      }

      // Find the booking by order ID
      const booking = await Booking.findOne({ 
        where: { orderId },
        include: [
          { model: SeatPricing, as: 'seatPricing' }
        ]
      });

      if (!booking) {
        throw new NotFound('Booking not found');
      }

      // If already paid, return the booking
      if (booking.paymentStatus === 'paid') {
        return booking;
      }

      // Call Cashfree API to get order status
      const url = `${cashfreeApiUrl}/orders/${orderId}`;
      const headers = {
        'x-client-id': cashfreeApiKey,
        'x-client-secret': cashfreeApiSecret,
        'x-api-version': cashfreeApiVersion,
        'Content-Type': 'application/json'
      };

      const response = await axios.get(url, { headers });
      const orderData = response.data;

      // Map the status
      const paymentStatus = mapPaymentStatus(orderData.payment_status || orderData.order_status);

      // Update booking if status has changed
      if (booking.paymentStatus !== paymentStatus) {
        await booking.update({
          paymentStatus,
          providerResponse: orderData,
          lastCheckedAt: new Date()
        });
      }

      return booking;
    } catch (error) {
      console.error('Error checking order status:', error);
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Status code:', error.response.status);
      }
      throw error;
    }
  }
};

module.exports = paymentService;
