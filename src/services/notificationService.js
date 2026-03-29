const twilio   = require('twilio');
const { Op } = require('sequelize');
const { Notification, Booking, User } = require('../db/models');
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Sandbox:    whatsapp:+14155238886
// Production: whatsapp:+YOUR_TWILIO_NUMBER
const FROM = `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`;

// ── Message templates ──────────────────────────────────────────────────────
const templates = {
  booking_confirmed: (b) =>
`Hello ${b.customerName}! 🚗

Your ExpressWay Cab booking is *confirmed*.

*Booking ID:* ${b.bookingId}
*Type:* ${b.bookingType?.toUpperCase()}
*From:* ${b.startLocation}
*To:* ${b.endLocation}
*Pickup:* ${b.pickup}
*Date:* ${b.journeyDate}
${b.seats?.length ? `*Seats:* ${b.seats.join(', ')}` : ''}
*Amount:* ₹${b.totalAmount}

Have a safe journey! 🙏`,

  booking_cancelled: (b) =>
`Hello ${b.customerName},

Your booking *#${b.bookingId}* has been cancelled.

*Route:* ${b.startLocation} → ${b.endLocation}
*Date:* ${b.journeyDate}
*Refund:* Will be processed in 5–7 working days.

Book again at expresswaycab.com 🚖`,

  trip_reminder: (b) =>
`⏰ *Trip Reminder* — ExpressWay Cab

Your trip starts in *1 hour*!

*Booking ID:* ${b.bookingId}
*Pickup:* ${b.pickup}
*To:* ${b.endLocation}
*Time:* ${b.startTime}

Please be ready at your pickup point. 🙌`,
};

// ── Core send function ─────────────────────────────────────────────────────
const sendWhatsApp = async (phone, type, bookingData, notificationId = null) => {
  const to      = `whatsapp:+91${phone.replace(/\D/g, '').slice(-10)}`;
  const body    = templates[type](bookingData);

  try {
    const msg = await client.messages.create({ from: FROM, to, body });

    if (notificationId) {
      await Notification.update(
        { status: 'sent', messageSid: msg.sid, sentAt: new Date() },
        { where: { id: notificationId } }
      );
    }
    console.log(`[WhatsApp] Sent ${type} to ${to} — SID: ${msg.sid}`);
    return { success: true, sid: msg.sid };

  } catch (err) {
    console.error(`[WhatsApp] Failed ${type} to ${to}:`, err.message);

    if (notificationId) {
      await Notification.increment('attemptCount', { where: { id: notificationId } });
      await Notification.update(
        { status: 'failed', lastError: err.message },
        { where: { id: notificationId } }
      );
    }
    return { success: false, error: err.message };
  }
};

// ── Public methods ─────────────────────────────────────────────────────────

// ✅ FIX — notifyBookingConfirmed mein data object update karo
const notifyBookingConfirmed = async (booking, user) => {
  const notification = await Notification.create({
    bookingId: booking.id,
    userId:    user.id,
    phone:     user.phoneNo,
    type:      'booking_confirmed',
    status:    'pending',
  });

  // ✅ Pull names from included associations
  const data = {
    customerName:  user.firstName || 'Customer',
    bookingId:     booking.bookingId,
    bookingType:   booking.bookingType,
    startLocation: booking.trip?.startLocation?.name || booking.priceBreakdown?.pickupAddress || '',
    endLocation:   booking.trip?.endLocation?.name   || booking.priceBreakdown?.dropAddress   || '',
    pickup:        booking.pickupPoint?.name          || booking.priceBreakdown?.pickupAddress || '',
    journeyDate:   booking.journeyDate,
    seats:         Array.isArray(booking.seats)
                     ? booking.seats
                     : JSON.parse(booking.seats || '[]'),
    totalAmount:   booking.totalAmount,
  };

  return sendWhatsApp(user.phoneNo, 'booking_confirmed', data, notification.id);
};

const notifyBookingCancelled = async (booking, user) => {
  const notification = await Notification.create({
    bookingId: booking.id,
    userId:    user.id,
    phone:     user.phoneNo,
    type:      'booking_cancelled',
    status:    'pending',
  });

  const data = {
    customerName:  user.firstName || 'Customer',
    bookingId:     booking.bookingId,

    // ❌ CURRENT — yeh fields booking pe directly nahi hote
    // startLocation: booking.startLocation,
    // endLocation:   booking.endLocation,

    // ✅ FIX — trip association ke andar se lo
    startLocation: booking.trip?.startLocation?.name
                || booking.trip?.dataValues?.startLocation?.name
                || booking.startLocation   // formatRide se aaya ho to
                || '',

    endLocation:   booking.trip?.endLocation?.name
                || booking.trip?.dataValues?.endLocation?.name
                || booking.endLocation
                || '',

    journeyDate:   booking.journeyDate
                ? (typeof booking.journeyDate === 'string'
                    ? booking.journeyDate.split('T')[0]
                    : new Date(booking.journeyDate).toISOString().split('T')[0])
                : '',
  };

  return sendWhatsApp(user.phoneNo, 'booking_cancelled', data, notification.id);
};

// Called by cron job — creates log row with scheduledFor
const scheduleReminderNotification = async (booking, user, tripStartTime) => {
  const scheduledFor = new Date(new Date(tripStartTime).getTime() - 60 * 60 * 1000); // 1hr before

  await Notification.create({
    bookingId:    booking.id,
    userId:       user.id,
    phone:        user.phoneNo,
    type:         'trip_reminder',
    status:       'pending',
    scheduledFor,
  });
};

// Retry failed messages — called by cron every 15 min
const retryFailedNotifications = async () => {
  const { Booking, User } = require('../db/models');

  const failed = await Notification.findAll({
    where: { status: 'failed', attemptCount: { [Op.lt]: 3 } },
    include: [
      { model: Booking, as: 'booking', required: false },  // ← add as: 'booking'
    ],
    limit: 20,
  });

  for (const notif of failed) {
    try {
      const user = await User.findByPk(notif.userId);
      if (!user?.phoneNo) continue;

      // Build basic data from notification record
      const data = {
        customerName:  user.firstName || 'Customer',
        bookingId:     notif.booking?.bookingId || `#${notif.bookingId}`,
        bookingType:   notif.booking?.bookingType || 'sharing',
        startLocation: notif.booking?.trip?.startLocation?.name || '',
        endLocation:   notif.booking?.trip?.endLocation?.name   || '',
        pickup:        notif.booking?.pickupPoint?.name         || '',
        journeyDate:   notif.booking?.journeyDate               || '',
        seats:         notif.booking?.seats                     || [],
        totalAmount:   notif.booking?.totalAmount               || '',
      };

      await sendWhatsApp(notif.phone, notif.type, data, notif.id);
    } catch (e) {
      console.error(`[RetryJob] Failed for notification ${notif.id}:`, e.message);
    }
  }
};

module.exports = {
  notifyBookingConfirmed,
  notifyBookingCancelled,
  scheduleReminderNotification,
  retryFailedNotifications,
  sendWhatsApp,
};