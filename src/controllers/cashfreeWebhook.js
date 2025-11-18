const db = require('../db/models');
const { Booking } = db;

const CashfreeWebhook = async (req, res) => {
  try {
    // 1. Parsing the Raw Body
    const event = JSON.parse(req.body.toString());
    const paymentOrderId = event.data.order.order_id;
    
    // Extract the booking ID from the order ID format: ORDER_<bookingId>_<timestamp>
    const orderIdParts = paymentOrderId.split('_');
    const bookingId = orderIdParts.length >= 2 ? orderIdParts[1] : paymentOrderId;
    
    console.log("EVENT TYPE:", event.type, "ORDER ID:", paymentOrderId, "BOOKING ID:", bookingId);

    // Variable to hold the number of updated rows
    let updatedRows = [0]; 

    // 2. Handling PAYMENT_SUCCESS_WEBHOOK
    if (event.type === "PAYMENT_SUCCESS_WEBHOOK") {
      // Using model field names (camelCase) - Sequelize will map to snake_case in the database
      updatedRows = await Booking.update(
        {
          paymentStatus: "completed",
          bookingStatus: "confirmed"
        },
        { 
          where: { 
            id: bookingId,
            paymentOrderId: paymentOrderId 
          } 
        }
      );
    }

    // 3. Handling PAYMENT_FAILED_WEBHOOK
    if (event.type === "PAYMENT_FAILED_WEBHOOK") {
      // Using model field names (camelCase) - Sequelize will map to snake_case in the database
      updatedRows = await Booking.update( 
        {
          paymentStatus: "failed",
          bookingStatus: "cancelled"
        },
        { 
          where: { 
            id: bookingId,
            paymentOrderId: paymentOrderId 
          } 
        }
      );
    }

    // 4. Logging the Result (Crucial for Debugging)
    // updatedRows[0] will be 1 if updated, 0 if no match found.
    console.log(`✅ Update Result for ${paymentOrderId}: ${updatedRows[0]} row(s) updated.`);
    
    return res.status(200).send("OK");
    
  } catch (err) {
    console.log("⚠️ Webhook Error:", err);
    return res.status(200).send("OK"); 
  }
};

module.exports = CashfreeWebhook;