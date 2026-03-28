const db = require('../db/models');
const { Trip, StartLocation, EndLocation, PickupPoint, DropPoint } = db;
const notificationService = require('../services/notificationService');

const CashfreeWebhook = async (req, res) => {
  try {
    const event = JSON.parse(req.body.toString());
    const paymentOrderId = event.data.order.order_id;

    const orderIdParts = paymentOrderId.split('_');
    const bookingId = orderIdParts.length >= 2 ? orderIdParts[1] : paymentOrderId;

    console.log("EVENT TYPE:", event.type, "ORDER ID:", paymentOrderId, "BOOKING ID:", bookingId);

    let updatedRows = [0];

    if (event.type === "PAYMENT_SUCCESS_WEBHOOK") {
      updatedRows = await Booking.update(
        {
          paymentStatus: 'completed',
          bookingStatus: 'confirmed',   // ✅ confirmed only here
        },
        {
          where: {
            id:            bookingId,
            paymentOrderId: paymentOrderId,
          },
        }
      );

      // ✅ Send WhatsApp notification after confirmed
      if (updatedRows[0] > 0) {
        try {
          const booking = await Booking.findByPk(bookingId, {
  include: [
    {
      model: Trip,
      as: 'trip',
      include: [
        { model: StartLocation, as: 'startLocation' },
        { model: EndLocation,   as: 'endLocation'   },
      ],
    },
    { model: PickupPoint, as: 'pickupPoint', required: false },
    { model: DropPoint,   as: 'dropPoint',   required: false },
  ],
});
          const user    = await User.findByPk(booking?.userId);
          if (booking && user) {
            await notificationService.notifyBookingConfirmed(booking, user);
          }
        } catch (notifErr) {
          // Never let notification failure affect webhook response
          console.error('WhatsApp notification failed:', notifErr.message);
        }
      }
    }

    if (event.type === "PAYMENT_FAILED_WEBHOOK") {
      updatedRows = await Booking.update(
        {
          paymentStatus: 'failed',
          bookingStatus: 'cancelled',
        },
        {
          where: {
            id:            bookingId,
            paymentOrderId: paymentOrderId,
          },
        }
      );
    }

    console.log(`✅ Update Result for ${paymentOrderId}: ${updatedRows[0]} row(s) updated.`);
    return res.status(200).send("OK");

  } catch (err) {
    console.log("⚠️ Webhook Error:", err);
    return res.status(200).send("OK");
  }
};

module.exports = CashfreeWebhook;