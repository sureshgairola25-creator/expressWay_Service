
const db = require('../db/models');
const { Booking } = db;

const CashfreeWebhook = async (req, res) => {
    try {
      const event = req.body;
  
      console.log("Webhook Received:", event.type, event.data.order_id);
  
      if (event.type === "PAYMENT_SUCCESS") {
        const result = await Booking.update(
          {
            paymentStatus: "completed",
            bookingStatus: "confirmed"
            // payment_id: event.data.payment_id,
            // paid_amount: event.data.amount,
          },
          { where: { paymentOrderId: event.data.order_id } }
        );
        console.log("Payment Success:", result);
      }
  
      if (event.type === "PAYMENT_FAILED") {
        const result = await Booking.update(
          {
            paymentStatus: "failed",
            bookingStatus: "cancelled",
          },
          { where: { paymentOrderId: event.data.order_id } }
        );
        console.log("Payment Failed:", result);
      }
  
      res.status(200).send("OK");
  
    } catch (err) {
      console.log("Webhook Error:", err);
      res.status(500).send("Webhook Error");
    }
  };
  

module.exports = CashfreeWebhook;
  