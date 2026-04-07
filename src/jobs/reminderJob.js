const cron = require('node-cron');
const { Op } = require('sequelize');
const {
  Booking, Trip, User,
  StartLocation, EndLocation,
  PickupPoint, Notification,
} = require('../db/models');
const { sendWhatsApp, retryFailedNotifications } = require('../services/notificationService');

// ── Reminder job — runs every 5 minutes ───────────────────────────────────
// Finds bookings whose trip starts in the next 55–65 min window
// and haven't had a reminder sent yet

cron.schedule('*/10 * * * *', async () => {
  console.log('[ReminderJob] Running...');
  try {
    const now = new Date();
    const in55min = new Date(now.getTime() + 55 * 60 * 1000);
    const in65min = new Date(now.getTime() + 65 * 60 * 1000);

    // Find upcoming confirmed bookings in the 1-hour window
    const bookings = await Booking.findAll({
      where: {
        bookingStatus: 'confirmed',
      },
      include: [
        {
          model: Trip,
          as: 'trip',
          required: true,
          where: {
            // Trip startTime jo 55-65 min window mein ho
            startTime: { [Op.between]: [in55min, in65min] },
          },
          include: [
            { model: StartLocation, as: 'startLocation' },
            { model: EndLocation, as: 'endLocation' },
          ],
        },
        { model: PickupPoint, as: 'pickupPoint', required: false },
      ],
    });


    for (const booking of bookings) {
      // Skip if reminder already sent for this booking
      // ✅ Already sent check — bookingId + journeyDate dono match karo
      const alreadySent = await Notification.findOne({
        where: {
          bookingId: booking.id,
          type: 'trip_reminder',
          status: 'sent',
          // Same journey date pe dobara na bheje
          scheduledFor: {
            [Op.between]: [
              new Date(booking.journeyDate + 'T00:00:00'),
              new Date(booking.journeyDate + 'T23:59:59'),
            ],
          },
        },
      });
      if (alreadySent) continue;

      const user = await User.findByPk(booking.userId);
      if (!user?.phoneNo) continue;

      const data = {
        customerName: user.firstName,
        bookingId: booking.bookingId,
        pickup: booking.pickupPoint?.name || booking.trip?.startLocation?.name,
        endLocation: booking.trip?.endLocation?.name,
        journeyDate: booking.journeyDate,
        startTime: new Date(booking.trip.startTime).toLocaleTimeString('en-IN', {
          hour: '2-digit', minute: '2-digit', hour12: true,
        }),
      };

      // Create log then send
      const notif = await Notification.create({
        bookingId: booking.id,
        userId: user.id,
        phone: user.phoneNo,
        type: 'trip_reminder',
        status: 'pending',
        scheduledFor: now,
      });

      await sendWhatsApp(user.phoneNo, 'trip_reminder', data, notif.id);
    }
  } catch (err) {
    console.error('[ReminderJob] Error:', err);
  }
});

// ── Retry failed notifications — every 15 minutes ─────────────────────────
cron.schedule('*/15 * * * *', async () => {
  console.log('[RetryJob] Retrying failed notifications...');
  try {
    await retryFailedNotifications();
  } catch (err) {
    console.error('[RetryJob] Error:', err);
  }
});

// ✅ FIX — snake_case column names with Sequelize literal
cron.schedule('*/5 * * * *', async () => {
  try {
    const { literal } = require('sequelize');

    const [count] = await Booking.update(
      { bookingStatus: 'expired' },
      {
        where: {
          bookingStatus: 'initiated',
          [Op.or]: [
            // paymentExpiry set hai aur expire ho gayi
            { paymentExpiry: { [Op.lt]: new Date() } },

            // paymentExpiry NULL + booking 15 min purani (fallback)
            // literal() use karo taaki Sequelize field mapping bypass ho
            literal(
              `(payment_expiry IS NULL AND created_at < '${
                new Date(Date.now() - 15 * 60 * 1000)
                  .toISOString()
                  .slice(0, 19)
                  .replace('T', ' ')
              }')`
            ),
          ],
        },
      }
    );

    if (count > 0) console.log(`[Cron] Expired ${count} initiated bookings`);
  } catch (err) {
    console.error('[Cron] Expire bookings error:', err.message);
  }
});