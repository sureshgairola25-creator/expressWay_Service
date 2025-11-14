
const db = require('../db/models');
const { Booking } = db;

const CashfreeWebhook = async (req, res) => {
  try {
    console.log("🔥 RAW BODY:", req.body.toString());

    const event = JSON.parse(req.body.toString());

    console.log("EVENT:", event.type, event.data.order_id);

    if (event.type === "PAYMENT_SUCCESS") {
      await Booking.update(
        {
          paymentStatus: "completed",
          bookingStatus: "confirmed"
        },
        { where: { paymentOrderId: event.data.order_id } }
      );
    }

    if (event.type === "PAYMENT_FAILED") {
      await Booking.update(
        {
          paymentStatus: "failed",
          bookingStatus: "cancelled"
        },
        { where: { paymentOrderId: event.data.order_id } }
      );
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.log("Webhook Error:", err);
    return res.status(200).send("OK"); // Cashfree must always get 200
  }
};

  

module.exports = CashfreeWebhook;
  