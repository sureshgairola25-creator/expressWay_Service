// const cron = require('node-cron');
// const { Op } = require('sequelize');
// const {
//   Booking, Trip, User,
//   StartLocation, EndLocation,
//   PickupPoint, Notification,
// } = require('../db/models');
// const { sendWhatsApp, retryFailedNotifications } = require('../services/notificationService');

// // ── Reminder job — runs every 5 minutes ───────────────────────────────────
// // Finds bookings whose trip starts in the next 55–65 min window
// // and haven't had a reminder sent yet

// cron.schedule('*/10 * * * *', async () => {
//   console.log('[ReminderJob] Running...');
//   try {
//     const now = new Date();
//     const in55min = new Date(now.getTime() + 55 * 60 * 1000);
//     const in65min = new Date(now.getTime() + 65 * 60 * 1000);

//     // Find upcoming confirmed bookings in the 1-hour window
//     const bookings = await Booking.findAll({
//       where: {
//         bookingStatus: 'confirmed',
//       },
//       include: [
//         {
//           model: Trip,
//           as: 'trip',
//           required: true,
//           where: {
//             // Trip startTime jo 55-65 min window mein ho
//             startTime: { [Op.between]: [in55min, in65min] },
//           },
//           include: [
//             { model: StartLocation, as: 'startLocation' },
//             { model: EndLocation, as: 'endLocation' },
//           ],
//         },
//         { model: PickupPoint, as: 'pickupPoint', required: false },
//       ],
//     });


//     for (const booking of bookings) {
//       // Skip if reminder already sent for this booking
//       // ✅ Already sent check — bookingId + journeyDate dono match karo
//       const alreadySent = await Notification.findOne({
//         where: {
//           bookingId: booking.id,
//           type: 'trip_reminder',
//           status: 'sent',
//           // Same journey date pe dobara na bheje
//           scheduledFor: {
//             [Op.between]: [
//               new Date(booking.journeyDate + 'T00:00:00'),
//               new Date(booking.journeyDate + 'T23:59:59'),
//             ],
//           },
//         },
//       });
//       if (alreadySent) continue;

//       const user = await User.findByPk(booking.userId);
//       if (!user?.phoneNo) continue;

//       const data = {
//         customerName: user.firstName,
//         bookingId: booking.bookingId,
//         pickup: booking.pickupPoint?.name || booking.trip?.startLocation?.name,
//         endLocation: booking.trip?.endLocation?.name,
//         journeyDate: booking.journeyDate,
//         startTime: new Date(booking.trip.startTime).toLocaleTimeString('en-IN', {
//           hour: '2-digit', minute: '2-digit', hour12: true,
//         }),
//       };

//       // Create log then send
//       const notif = await Notification.create({
//         bookingId: booking.id,
//         userId: user.id,
//         phone: user.phoneNo,
//         type: 'trip_reminder',
//         status: 'pending',
//         scheduledFor: now,
//       });

//       await sendWhatsApp(user.phoneNo, 'trip_reminder', data, notif.id);
//     }
//   } catch (err) {
//     console.error('[ReminderJob] Error:', err);
//   }
// });

// // ── Retry failed notifications — every 15 minutes ─────────────────────────
// cron.schedule('*/15 * * * *', async () => {
//   console.log('[RetryJob] Retrying failed notifications...');
//   try {
//     await retryFailedNotifications();
//   } catch (err) {
//     console.error('[RetryJob] Error:', err);
//   }
// });

// // ✅ FIX — snake_case column names with Sequelize literal
// cron.schedule('*/5 * * * *', async () => {
//   try {
//     const { literal } = require('sequelize');

//     // ✅ Step 1 — Find expired bookings BEFORE updating (need seatCount + tripId)
//     const expiredBookings = await Booking.findAll({
//       where: {
//         bookingStatus: 'initiated',
//         [Op.or]: [
//           { paymentExpiry: { [Op.lt]: new Date() } },
//           literal(
//             `(payment_expiry IS NULL AND created_at < '${
//               new Date(Date.now() - 15 * 60 * 1000)
//                 .toISOString()
//                 .slice(0, 19)
//                 .replace('T', ' ')
//             }')`
//           ),
//         ],
//       },
//       attributes: ['id', 'tripId', 'seats', 'bookingType', 'journeyDate'],
//     });

//     if (expiredBookings.length === 0) return;

//     // ✅ Step 2 — Mark all as expired
//     const expiredIds = expiredBookings.map(b => b.id);
//     const [count] = await Booking.update(
//       { bookingStatus: 'expired' },
//       { where: { id: { [Op.in]: expiredIds } } }
//     );

//     // ✅ Step 3 — Restore seats back to each trip
//     // Group by tripId — sum up seatCount per trip
//     const seatRestoreMap = {};
//     for (const booking of expiredBookings) {
//       // const seats = parseInt(booking.seatCount) || 0;
//       const seatsArr = Array.isArray(booking.seats)
//         ? booking.seats
//         : JSON.parse(booking.seats || '[]');
//       const seats = seatsArr.length || 0;
//       if (seats <= 0) continue;
//       if (!seatRestoreMap[booking.tripId]) {
//         seatRestoreMap[booking.tripId] = 0;
//       }
//       seatRestoreMap[booking.tripId] += seats;
//     }

//     // Increment availableSeats for each affected trip
//     for (const [tripId, seatsToRestore] of Object.entries(seatRestoreMap)) {
//       await Trip.increment('availableSeats', {
//         by: seatsToRestore,
//         where: { id: parseInt(tripId) }
//       });
//       console.log(`[Cron] Restored ${seatsToRestore} seat(s) to trip ${tripId}`);
//     }

//     if (count > 0) console.log(`[Cron] Expired ${count} initiated bookings`);

//   } catch (err) {
//     console.error('[Cron] Expire bookings error:', err.message);
//   }
// });

// // ── Runs at midnight daily — resets available_seats for recurring trips ──
// cron.schedule('0 0 * * *', async () => {
//   try {
//     const today = new Date().toISOString().split('T')[0];

//     // Find all recurring trips
//     const recurringTrips = await Trip.findAll({
//       where: {
//         isRecurring: true,
//         status:      true,
//       },
//       attributes: ['id', 'totalSeatsSnapshot', 'seatsPerCabinSnapshot']
//     });

//     if (recurringTrips.length === 0) return;

//     for (const trip of recurringTrips) {
//       // Count active bookings for TODAY only
//       const activeBookings = await Booking.findAll({
//         where: {
//           tripId:        trip.id,
//           journeyDate:   today,
//           bookingStatus: { [Op.notIn]: ['cancelled', 'expired'] }
//         },
//         attributes: ['seatCount', 'seats', 'bookingType']
//       });

//       // Sum up booked seats for today
//       let bookedSeatsToday = 0;
//       for (const b of activeBookings) {
//         const seats = Array.isArray(b.seats)
//           ? b.seats
//           : JSON.parse(b.seats || '[]');
//         bookedSeatsToday += seats.length;
//       }

//       // available = total - booked for today
//       const totalSeats     = trip.totalSeatsSnapshot || 50;
//       const availableSeats = Math.max(0, totalSeats - bookedSeatsToday);

//       await Trip.update(
//         { availableSeats },
//         { where: { id: trip.id } }
//       );

//       console.log(
//         `[Cron Daily Reset] Trip ${trip.id}: ` +
//         `total=${totalSeats}, booked=${bookedSeatsToday}, available=${availableSeats}`
//       );
//     }

//     console.log(`[Cron Daily Reset] Processed ${recurringTrips.length} recurring trips`);

//   } catch (err) {
//     console.error('[Cron Daily Reset] Error:', err.message);
//   }
// });


const cron = require('node-cron');
const { Op, literal } = require('sequelize');
const {
  Booking, Trip, User,
  StartLocation, EndLocation,
  PickupPoint, Notification,
} = require('../db/models');
const { 
  sendWhatsApp, 
  retryFailedNotifications 
} = require('../services/notificationService');

// ── CRON 1: Every 10 min — expire bookings + restore seats + send reminders + retry notifications
// Merged 3 crons into 1 to save EC2 resources
cron.schedule('*/10 * * * *', async () => {
  console.log('[MainCron] Running...');

  // ── Task 1: Expire initiated bookings + restore seats ──────────────────
  try {
    const expiredBookings = await Booking.findAll({
      where: {
        bookingStatus: 'initiated',
        [Op.or]: [
          { paymentExpiry: { [Op.lt]: new Date() } },
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
      // ✅ FIX — use seats array, not seatCount column
      attributes: ['id', 'tripId', 'seats', 'bookingType', 'journeyDate'],
    });

    if (expiredBookings.length > 0) {
      const expiredIds = expiredBookings.map(b => b.id);

      await Booking.update(
        { bookingStatus: 'expired' },
        { where: { id: { [Op.in]: expiredIds } } }
      );

      // Group seats by tripId
      const seatRestoreMap = {};
      for (const booking of expiredBookings) {
        // ✅ FIX — use seats array length
        const seatsArr = Array.isArray(booking.seats)
          ? booking.seats
          : JSON.parse(booking.seats || '[]');
        const seatCount = seatsArr.length || 0;

        if (seatCount <= 0) continue;
        if (!seatRestoreMap[booking.tripId]) {
          seatRestoreMap[booking.tripId] = 0;
        }
        seatRestoreMap[booking.tripId] += seatCount;
      }

      for (const [tripId, seatsToRestore] of Object.entries(seatRestoreMap)) {
        await Trip.increment('availableSeats', {
          by: seatsToRestore,
          where: { id: parseInt(tripId) }
        });
        console.log(`[MainCron] Restored ${seatsToRestore} seat(s) to trip ${tripId}`);
      }

      console.log(`[MainCron] Expired ${expiredBookings.length} bookings`);
    }
  } catch (err) {
    console.error('[MainCron] Expire error:', err.message);
  }

  // ── Task 2: Send trip reminders (1 hour before departure) ─────────────
  try {
    const now    = new Date();
    const in55min = new Date(now.getTime() + 55 * 60 * 1000);
    const in65min = new Date(now.getTime() + 65 * 60 * 1000);

    const bookings = await Booking.findAll({
      where: { bookingStatus: 'confirmed' },
      include: [
        {
          model: Trip,
          as: 'trip',
          required: true,
          where: { startTime: { [Op.between]: [in55min, in65min] } },
          include: [
            { model: StartLocation, as: 'startLocation' },
            { model: EndLocation,   as: 'endLocation'   },
          ],
        },
        { model: PickupPoint, as: 'pickupPoint', required: false },
      ],
    });

    for (const booking of bookings) {
      const alreadySent = await Notification.findOne({
        where: {
          bookingId: booking.id,
          type:      'trip_reminder',
          status:    'sent',
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
        bookingId:    booking.bookingId,
        pickup:       booking.pickupPoint?.name || booking.trip?.startLocation?.name,
        endLocation:  booking.trip?.endLocation?.name,
        journeyDate:  booking.journeyDate,
        startTime:    new Date(booking.trip.startTime).toLocaleTimeString('en-IN', {
          hour: '2-digit', minute: '2-digit', hour12: true,
        }),
      };

      const notif = await Notification.create({
        bookingId:    booking.id,
        userId:       user.id,
        phone:        user.phoneNo,
        type:         'trip_reminder',
        status:       'pending',
        scheduledFor: now,
      });

      await sendWhatsApp(user.phoneNo, 'trip_reminder', data, notif.id);
    }
  } catch (err) {
    console.error('[MainCron] Reminder error:', err.message);
  }

  // ── Task 3: Retry failed notifications ────────────────────────────────
  try {
    await retryFailedNotifications();
  } catch (err) {
    console.error('[MainCron] Retry error:', err.message);
  }
});


// ── CRON 2: Midnight daily — reset available_seats for recurring trips ───
cron.schedule('0 0 * * *', async () => {
  console.log('[DailyReset] Running...');
  try {
    const today = new Date().toISOString().split('T')[0];

    const recurringTrips = await Trip.findAll({
      where: { isRecurring: true, status: true },
      attributes: ['id', 'totalSeatsSnapshot']
    });

    if (recurringTrips.length === 0) return;

    for (const trip of recurringTrips) {
      const activeBookings = await Booking.findAll({
        where: {
          tripId:        trip.id,
          journeyDate:   today,
          bookingStatus: { [Op.notIn]: ['cancelled', 'expired'] }
        },
        attributes: ['seats']
      });

      let bookedSeatsToday = 0;
      for (const b of activeBookings) {
        const seats = Array.isArray(b.seats)
          ? b.seats
          : JSON.parse(b.seats || '[]');
        bookedSeatsToday += seats.length;
      }

      const totalSeats     = trip.totalSeatsSnapshot || 50;
      const availableSeats = Math.max(0, totalSeats - bookedSeatsToday);

      await Trip.update(
        { availableSeats },
        { where: { id: trip.id } }
      );

      console.log(
        `[DailyReset] Trip ${trip.id}: ` +
        `total=${totalSeats}, booked=${bookedSeatsToday}, available=${availableSeats}`
      );
    }

    console.log(`[DailyReset] Processed ${recurringTrips.length} trips`);
  } catch (err) {
    console.error('[DailyReset] Error:', err.message);
  }
});