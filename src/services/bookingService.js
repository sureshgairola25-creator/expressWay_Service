// services/bookingService.js
// ─────────────────────────────────────────────────────────────────────────────
// Supports 3 booking types: sharing, cabin, personalize
// Sharing + Cabin: passenger info stored per seat
// ─────────────────────────────────────────────────────────────────────────────

const db = require('../db/models');
const {
  Booking, BookedSeat, Trip, Seat, User, Car,
  StartLocation, EndLocation, PickupPoint, DropPoint
} = db;
const { sequelize } = require('../db/database');
const { Op } = require('sequelize');
const { NotFound, BadRequest } = require('http-errors');
const paymentService = require('./paymentService');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: generate booking ID like EC0001
// ─────────────────────────────────────────────────────────────────────────────
const generateNextBookingId = async () => {
  try {
    const lastBooking = await Booking.findOne({
      attributes: ['bookingId'],
      where: { bookingId: { [Op.like]: 'EC%' } },
      order: [['id', 'DESC']],
    });
    let nextNumber = 1;
    if (lastBooking?.bookingId) {
      const lastNumber = parseInt(lastBooking.bookingId.replace('EC', ''), 10);
      if (!isNaN(lastNumber)) nextNumber = lastNumber + 1;
    }
    return `EC${nextNumber.toString().padStart(4, '0')}`;
  } catch (error) {
    return `EC${Date.now().toString().slice(-4)}`;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: validate trip is active and journeyDate is valid
// ─────────────────────────────────────────────────────────────────────────────
const validateTripAndDate = async (tripId, journeyDate) => {
  const trip = await Trip.findByPk(tripId, { include: [{ model: Car,as: 'car',required: true }] });
  if (!trip)               throw new BadRequest('Trip not found');
  if (trip.status !== true) throw new BadRequest('Trip is not active');

  const tripStartDate = new Date(trip.startTime).toISOString().split('T')[0];
  if (!trip.isRecurring) {
    if (journeyDate !== tripStartDate)
      throw new BadRequest(`This trip is only available on ${tripStartDate}`);
  } else {
    if (journeyDate < tripStartDate)
      throw new BadRequest(`Journey date cannot be before the trip start date (${tripStartDate})`);
  }
  return trip;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build payment amounts
// ─────────────────────────────────────────────────────────────────────────────
// ✅ FIX — use only valid ENUM values
const buildPaymentAmounts = (totalAmount, paidAmount, paymentMode) => {
  const total     = parseFloat(totalAmount);
  const paid      = parseFloat(paidAmount);
  const remaining = paymentMode === 'full' ? 0 : parseFloat((total - paid).toFixed(2));
  return {
    totalAmount:     total,
    paidAmount:      paid,
    remainingAmount: remaining,
    paymentStatus:   paymentMode === 'full' ? 'completed' : 'pending', // ✅ "pending" for partial
  };
};


// ─────────────────────────────────────────────────────────────────────────────
// Helper: get already booked seat numbers for a trip on a date
// ─────────────────────────────────────────────────────────────────────────────
async function getBookedSeatNumbers(tripId, journeyDate) {
  const activeBookings = await Booking.findAll({
    where: {
      tripId,
      journeyDate: new Date(journeyDate),
      bookingStatus: { [Op.notIn]: ['cancelled', 'failed', 'expired'] }
    },
    attributes: ['seats'],
    raw: true
  });

  const bookedSeats = new Set();
  activeBookings.forEach(b => {
    const seats = typeof b.seats === 'string' ? JSON.parse(b.seats) : (b.seats || []);
    seats.forEach(s => bookedSeats.add(s.seatNumber || s.seat_number || s));
  });

  return bookedSeats;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: sanitize passenger array
// Links each passenger to their seat number
// ─────────────────────────────────────────────────────────────────────────────
const sanitizePassengers = (passengers, seatNumbers) => {
  return passengers.map((p, i) => ({
    ...p,
    seatNumber: seatNumbers[i] || null,           // which seat this passenger occupies
    fullName:   p.fullName.trim(),
    age:        parseInt(p.age),
    gender:     p.gender.toLowerCase(),
    phone:      String(p.phone).trim(),
    email:      p.email.trim().toLowerCase(),
  }));
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: standard booking response shape
// ─────────────────────────────────────────────────────────────────────────────
const formatBookingResponse = (booking, paymentSessionId = null) => ({
  bookingId:       booking.bookingId,
  id:              booking.id,
  bookingType:     booking.bookingType,
  paymentMode:     booking.paymentMode,
  totalAmount:     booking.totalAmount,
  paidAmount:      booking.paidAmount,
  remainingAmount: booking.remainingAmount,
  paymentStatus:   booking.paymentStatus,
  bookingStatus:   booking.bookingStatus,
  journeyDate:     booking.journeyDate,
  passengers:      booking.passengers || [],
  ...(paymentSessionId && { paymentSessionId }),
});

// ─────────────────────────────────────────────────────────────────────────────

const bookingService = {

  // ── FLOW 1: Sharing Cab Booking ────────────────────────────────────────────
  initiateBooking: async (bookingData) => {
    const {
      userId, tripId, pickupPointId, dropPointId,
      selectedSeats, totalAmount, paidAmount, paymentMode = 'full',
      customerEmail, customerPhone, selectedMeal, addons = [],
      discountAmount = 0, couponCode = null, finalPayableAmount,
      journeyDate,
      passengers = [],   // one per selected seat
    } = bookingData;

    const user = await User.findByPk(userId);
    if (!user) throw new BadRequest('User not found');

    const trip = await validateTripAndDate(tripId, journeyDate);

    // AFTER — availableModes bhi check karo
    const carModes = trip.car?.availableModes || [];
    const isSharingEligible =
      trip.car?.cabType === 'sharing' ||
      carModes.includes('sharing');

    if (!isSharingEligible) {
      throw new BadRequest('This trip is not a sharing cab.');
    }


    // Seat availability check
    const bookedSeatNumbers = await getBookedSeatNumbers(tripId, journeyDate);
    const conflictSeats = selectedSeats.filter(s => bookedSeatNumbers.has(s));
    if (conflictSeats.length > 0) {
      throw new BadRequest(`Seat(s) ${conflictSeats.join(', ')} are already booked for this date`);
    }

    // Validate seat records
    const seatRecords = await Seat.findAll({ where: { tripId, seatNumber: selectedSeats } });
    if (seatRecords.length !== selectedSeats.length) {
      const found   = seatRecords.map(s => s.seatNumber);
      const missing = selectedSeats.filter(s => !found.includes(s));
      throw new BadRequest(`Seats not found: ${missing.join(', ')}`);
    }

    // Get current car price — source of truth for pricing
    const car = await Car.findByPk(trip.carId, {
      attributes: ['pricePerSeat', 'cabType']
    });

    const pickupPoint = await PickupPoint.findByPk(pickupPointId, {
      attributes: ['id', 'name', 'price', 'type']
    });

    // Price priority rule:
    //   IF pickup_point_price EXISTS AND pickup_point_price < seat_price
    //   THEN use pickup_point_price  (user gets cheaper boarding-point rate)
    //   ELSE use seat_price          (car base price)
    const basePricePerSeat  = parseFloat(car?.pricePerSeat || 0);
    const pickupPointPrice  = pickupPoint?.price != null ? parseFloat(pickupPoint.price) : null;
    // const effectivePricePerSeat = (pickupPointPrice !== null && pickupPointPrice < basePricePerSeat)
      // ? pickupPointPrice
      // : basePricePerSeat;
      const effectivePricePerSeat = pickupPointPrice !== null
  ? pickupPointPrice       // ← pickup point price takes priority
  : basePricePerSeat;   

    const seatTotal = effectivePricePerSeat * seatRecords.length;

    let extrasTotal = 0;
    const breakdown = { seatTotal, extras: [], subtotal: 0, coupon: null };

    if (selectedMeal?.price) {
      extrasTotal += parseFloat(selectedMeal.price);
      breakdown.extras.push({ type: selectedMeal.type || 'Meal', price: parseFloat(selectedMeal.price) });
    }
    if (Array.isArray(addons) && addons.length > 0) {
      addons.forEach(addon => {
        extrasTotal += parseFloat(addon.price || 0);
        breakdown.extras.push({ type: addon.type || 'Addon', price: parseFloat(addon.price || 0) });
      });
    }

    const calculatedSubtotal = seatTotal + extrasTotal;
    breakdown.subtotal = calculatedSubtotal;

    if (couponCode) {
      breakdown.coupon = {
        code: couponCode,
        discount: parseFloat(discountAmount) || 0,
        finalAmount: parseFloat(finalPayableAmount) || calculatedSubtotal
      };
    }

    if (Math.abs(calculatedSubtotal - parseFloat(totalAmount)) > 0.01) {
      throw new BadRequest(`Subtotal mismatch. Expected ${calculatedSubtotal}, received ${totalAmount}`);
    }

    const effectiveFinal = parseFloat(finalPayableAmount || totalAmount);
    if (paymentMode === 'full' && Math.abs(parseFloat(paidAmount) - effectiveFinal) > 0.01) {
  throw new BadRequest('For full payment, paidAmount must equal totalAmount');
}
    const amounts = buildPaymentAmounts(effectiveFinal, paidAmount, paymentMode);

    // Sanitize passengers — link each to their seat
    // const sanitizedPassengers = sanitizePassengers(passengers, selectedSeats);
    const sanitizedPassengers = selectedSeats.map((seatNum, i) => {
  const p = passengers[i];
  return {
    seatNumber: seatNum,
    fullName:   p?.fullName  || "Guest",
    age:        p?.age       || null,
    gender:     p?.gender    || null,
    phone:      p?.phone     || null,
    email:      p?.email     || null,
  };
});


    // Transaction
    const t = await sequelize.transaction();
    let booking;

    try {
        // ── Race condition fix: lock the row ──────────────────────────────
  const freshTrip = await Trip.findOne({
    where: { id: tripId },
    lock: t.LOCK.UPDATE,
    transaction: t
  });

  if (!freshTrip || freshTrip.availableSeats == null) {
    throw new BadRequest('Trip not found');
  }
  if (freshTrip.availableSeats < selectedSeats.length) {
    throw new BadRequest(
      `Only ${freshTrip.availableSeats} seat(s) available, you requested ${selectedSeats.length}`
    );
  }
      const bookingId = await generateNextBookingId();

      booking = await Booking.create({
        bookingId,
        userId,
        tripId,
        pickupPointId,
        dropPointId,
        bookingType:    'sharing',
        seatCount:      selectedSeats.length,
        seats:          selectedSeats,
        journeyDate:    new Date(journeyDate),
        paymentMode,
        ...amounts,
        bookingStatus:  'initiated',
        couponCode,
        discountAmount: parseFloat(discountAmount) || 0,
        priceBreakdown: breakdown,
        selectedMeal,
        passengers:     sanitizedPassengers,   // ← stored as JSON
      }, { transaction: t });

      await BookedSeat.bulkCreate(
        seatRecords.map(seat => ({
          bookingId:  booking.id,
          tripId,
          seatNumber: seat.seatNumber,
          seatPrice:  seat.price,
          isCancelled: false,
        })),
        { transaction: t }
      );

      let paymentSessionId = null;
      if (amounts.paidAmount > 0) {
        const paymentResult = await paymentService.createOrder({
          orderId:      `ORDER_${booking.id}_${Date.now()}`,
          orderAmount:  amounts.paidAmount,
          customerEmail, customerPhone,
          customerId:   userId,
          bookingId:    booking.id,
        });
        await booking.update({
          paymentOrderId:   paymentResult.order_id,
          paymentSessionId: paymentResult.payment_session_id,
          paymentExpiry:    new Date(Date.now() + 30 * 60 * 1000),
        }, { transaction: t });
        paymentSessionId = paymentResult.payment_session_id;
      }
await Trip.decrement('availableSeats', {
    by: seatRecords.length,
    where: { id: tripId },
    transaction: t   // ← transaction pass karo
  });

      await t.commit();

      // Decrement available seats counter after successful commit
      // await Trip.decrement('availableSeats', { by: seatRecords.length, where: { id: tripId } });

      return formatBookingResponse(booking, paymentSessionId);
    } catch (error) {
      await t.rollback();
        console.error('[initiateBooking] Error:', error.message, error.stack);

      throw error;
    }
  },

  // ── FLOW 2: Cabin Cab Booking ──────────────────────────────────────────────
  initiateCabinBooking: async (bookingData) => {
    const {
      userId, tripId, pickupPointId, dropPointId,
      cabinNumber, cabinCapacity, cabinCount = 1,
      totalAmount, paidAmount, paymentMode = 'full',
      customerEmail, customerPhone, selectedMeal,
      journeyDate,
      passengers = [],   // one per seat in the cabin
    } = bookingData;
const bookedCabinCount = parseInt(cabinCount) || 1;

    const user = await User.findByPk(userId);
    if (!user) throw new BadRequest('User not found');

    const trip = await validateTripAndDate(tripId, journeyDate);
const carModes = trip.car?.availableModes || [];
const isCabinEligible =
  trip.car?.cabType === 'cabin' ||
  trip.car?.bookingMode === 'sharing_and_cabin' ||
  carModes.includes('cabin');

    if (!isCabinEligible) {
      throw new BadRequest('This trip is not a cabin cab.');
    }

    // Cabin availability check
    const cabinNumbersToBook = [];
for (let i = 0; i < bookedCabinCount; i++) {
  cabinNumbersToBook.push(parseInt(cabinNumber) + i);
}

const existingCabinBookings = await Booking.findAll({
  where: {
    tripId,
    journeyDate:      new Date(journeyDate),
    cabinNumber:      { [Op.in]: cabinNumbersToBook },
    booking_type:     'cabin',              // ← real DB column
    bookingStatus:    { [Op.notIn]: ['cancelled', 'expired'] }  // ← exclude expired
  }
});
if (existingCabinBookings.length > 0) {
  const bookedNums = existingCabinBookings.map(b => b.cabinNumber).join(', ');
  throw new BadRequest(`Cabin(s) ${bookedNums} already booked for this date`);
}
    const pickupPt = await PickupPoint.findByPk(pickupPointId, {
      attributes: ['id', 'name', 'price', 'type']
    });

    // Price priority rule (same as sharing):
    //   IF pickup_point_price EXISTS AND pickup_point_price < cabin_price
    //   THEN use pickup_point_price
    //   ELSE use car.pricePerCabin
    const basePricePerCabin  = parseFloat(trip.car?.pricePerCabin || 0);
    const pickupPtPrice = pickupPt?.price != null ? parseFloat(pickupPt.price) : null;
const effectivePricePerCabin = pickupPtPrice !== null 
  ? pickupPtPrice          // ← pickup point price takes priority
  : basePricePerCabin;  


    // ✅ AFTER — use actual cabinCount
    const expectedTotal = effectivePricePerCabin * bookedCabinCount;

    if (Math.abs(parseFloat(totalAmount) - expectedTotal) > 0.01) {
  throw new BadRequest(
    `Cabin price mismatch. Expected ₹${expectedTotal} ` +
    `(${bookedCabinCount} cabin${bookedCabinCount > 1 ? 's' : ''} × ₹${effectivePricePerCabin})`
  );
}
    const effectiveFinal = parseFloat(totalAmount);
    if (paymentMode === 'full' && Math.abs(parseFloat(paidAmount) - effectiveFinal) > 0.01) {
      throw new BadRequest('For full payment, paidAmount must equal totalAmount');
    }

    // Get seats in this cabin
    const capacity     = parseInt(cabinCapacity || trip.car?.cabinCapacity || 1);
const allSeats = await Seat.findAll({ 
  where: { tripId }, 
  order: [['seatNumber', 'ASC']] 
});

// Collect seats across all booked cabins
// cabinNumber = starting cabin, book consecutive cabins
let cabinSeatNumbers = [];
for (let i = 0; i < bookedCabinCount; i++) {
  const currentCabinIndex = (parseInt(cabinNumber) - 1) + i;
  const start = currentCabinIndex * capacity;
  const seats = allSeats.slice(start, start + capacity).map(s => s.seatNumber);
  cabinSeatNumbers = [...cabinSeatNumbers, ...seats];
}
const cabinSeats = allSeats.filter(s => cabinSeatNumbers.includes(s.seatNumber));


    const amounts = buildPaymentAmounts(totalAmount, paidAmount, paymentMode);

    // Sanitize passengers — link each to a cabin seat
    const sanitizedPassengers = sanitizePassengers(passengers, cabinSeatNumbers);

    const t = await sequelize.transaction();
    let booking;

    try {
       // ── Race condition fix + availability check ───────────────────────
  const freshTrip = await Trip.findOne({
    where: { id: tripId },
    lock: t.LOCK.UPDATE,
    transaction: t
  });

  if (!freshTrip) throw new BadRequest('Trip not found');

  const seatsNeeded = freshTrip.seatsPerCabinSnapshot || capacity;

  if (freshTrip.availableSeats == null || freshTrip.availableSeats < seatsNeeded) {
    throw new BadRequest(
      `Not enough seats for cabin booking. Available: ${freshTrip.availableSeats ?? 0}, needed: ${seatsNeeded}`
    );
  }
      const bookingId = await generateNextBookingId();

      booking = await Booking.create({
        bookingId,
        userId,
        tripId,
        pickupPointId,
        dropPointId,
        bookingType:   'cabin',
        cabinNumber:   parseInt(cabinNumber),
        seats:         cabinSeatNumbers,
        seatCount:     cabinSeatNumbers.length,
        journeyDate:   new Date(journeyDate),
        paymentMode,
        ...amounts,
        bookingStatus: 'initiated',
        selectedMeal,
        passengers:    sanitizedPassengers,   // ← stored as JSON
        priceBreakdown: {
          cabinNumber,
          cabinCount: bookedCabinCount,
          totalCabinPrice: effectivePricePerCabin * bookedCabinCount,
          cabinPrice: effectivePricePerCabin,
          seats: cabinSeatNumbers,
          pickupPointId,
          pickupPointName: pickupPt?.name || null,
          passengers: sanitizedPassengers.map(p => p.fullName),
          ...(selectedMeal?.price && {
            meal: { type: selectedMeal.type, price: selectedMeal.price }
          })
        },
      }, { transaction: t });

      if (cabinSeats.length > 0) {
        await BookedSeat.bulkCreate(
          cabinSeats.map(seat => ({
            bookingId:   booking.id,
            tripId,
            seatNumber:  seat.seatNumber,
            seatPrice:   seat.price,
            isCancelled: false,
          })),
          { transaction: t }
        );
      }

      let paymentSessionId = null;
      if (amounts.paidAmount > 0) {
        const paymentResult = await paymentService.createOrder({
          orderId:      `ORDER_${booking.id}_${Date.now()}`,
          orderAmount:  amounts.paidAmount,
          customerEmail, customerPhone,
          customerId:   userId,
          bookingId:    booking.id,
        });
        await booking.update({
          paymentOrderId:   paymentResult.order_id,
          paymentSessionId: paymentResult.payment_session_id,
          paymentExpiry:    new Date(Date.now() + 30 * 60 * 1000),
        }, { transaction: t });
        paymentSessionId = paymentResult.payment_session_id;
      }
      // ── Decrement INSIDE transaction ──────────────────────────────────
      const cabinSeatsCount = (freshTrip.seatsPerCabinSnapshot || capacity) * bookedCabinCount;

  await Trip.decrement('availableSeats', {
    by: cabinSeatsCount,
    where: { id: tripId },
    transaction: t   // ← transaction pass karo
  });

      await t.commit();

      return formatBookingResponse(booking, paymentSessionId);

    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND PATCH — bookingService.js
// In initiatePersonalizeBooking, make these changes:
// 1. Add pickupAddress to destructured fields
// 2. Remove pickupPointId / dropPointId as required
// 3. Store pickupAddress in booking
// ─────────────────────────────────────────────────────────────────────────────

initiatePersonalizeBooking: async (bookingData) => {
  const {
    userId,
    tripId,

    // ── Personalize uses manual address — NO pickupPointId/dropPointId ────────
    pickupAddress,        // FREE-TEXT address entered by user e.g. "A-12, Sector 62, Noida"
    pickupPointId = null, // kept for DB compatibility, always null for personalize
    dropPointId   = null, // kept for DB compatibility, always null for personalize

    journeyDate,
    journeyTime,          // "HH:MM"
    passengerCount,

    // Customer info
    fullName,
    customerEmail,
    customerPhone,

    // Optional
    flightTrainNumber,
    specialRequests,

    // Pricing — gst and discount default to 0
    // Frontend sends: gst=0, discount=0 (no auto GST, no auto discount)
    // Coupon discount: frontend validates coupon first, then sends discount amount
    baseFare,
    gst      = 0,         // always 0 unless explicitly passed
    discount = 0,         // 0 by default, coupon amount if coupon applied
    totalAmount,          // baseFare + gst - discount (= baseFare when gst=0, discount=0)
    paidAmount,
    paymentMode = 'full',
    couponCode  = null,

    selectedMeal,
  } = bookingData;

  // ── Validate user ────────────────────────────────────────────────────────────
  const user = await User.findByPk(userId);
  if (!user) throw new BadRequest('User not found');

  // ── Validate pickup address ──────────────────────────────────────────────────
  if (!pickupAddress || !pickupAddress.trim()) {
    throw new BadRequest('Pickup address is required for personalize booking');
  }

  // ── Validate trip and date ───────────────────────────────────────────────────
  const trip = await validateTripAndDate(tripId, journeyDate);
const carModes = trip.car?.availableModes || [];
const isPersonalizeEligible = 
  trip.car?.cabType === 'personalize' ||
  carModes.includes('personalize');

if (!isPersonalizeEligible) {
  throw new BadRequest('This trip is not a personalize cab.');
}

  if (trip.isFullyBooked) {
    throw new BadRequest('This trip is already fully booked');
  }

  // ── Check if already booked for this date ────────────────────────────────────
  const existingBooking = await Booking.findOne({
    where: {
      tripId,
      journeyDate:   new Date(journeyDate),
      bookingType:   'personalize',
      bookingStatus: { [Op.not]: 'cancelled' },
    },
  });
  if (existingBooking) {
    throw new BadRequest('This car is already reserved for the selected date');
  }

  const paxCount = parseInt(passengerCount);
  const totalSeats = trip.car?.totalSeats || 0;

  const carBasePrice = parseFloat(trip.car?.pricePerCar || 0);
  const gstAmount      = parseFloat(gst      || 0);
  const discountAmount = parseFloat(discount || 0);

  // baseFare must match car price
  if (Math.abs(parseFloat(baseFare) - carBasePrice) > 0.01) {
    throw new BadRequest(`Base fare mismatch. Expected ₹${carBasePrice}`);
  }

  // totalAmount = baseFare + gst - discount
  // When gst=0 and discount=0: totalAmount must equal baseFare
  // When coupon applied:        totalAmount must equal baseFare - discountAmount
  const expectedTotal = parseFloat(
    (carBasePrice + gstAmount - discountAmount).toFixed(2)
  );
  if (Math.abs(parseFloat(totalAmount) - expectedTotal) > 0.01) {
    throw new BadRequest(
      `Total amount mismatch. Expected ₹${expectedTotal}`
    );
  }

  // ── Seats list ────────────────────────────────────────────────────────────────
  const allSeats       = await Seat.findAll({ where: { tripId } });
  const allSeatNumbers = allSeats.map(s => s.seatNumber);
  const amounts        = buildPaymentAmounts(totalAmount, paidAmount, paymentMode);

  // ── Price breakdown ───────────────────────────────────────────────────────────
  const priceBreakdown = {
    baseFare:     carBasePrice,
    gst:          gstAmount,
    discount:     discountAmount,
    couponCode:   couponCode || null,
    totalAmount:  expectedTotal,
    pickupAddress: pickupAddress.trim(),
    ...(selectedMeal?.price && {
      meal: { type: selectedMeal.type, price: parseFloat(selectedMeal.price) }
    }),
  };

  // ── Transaction ───────────────────────────────────────────────────────────────
  const t = await sequelize.transaction();
  let booking;

  try {
    const bookingId = await generateNextBookingId();

    booking = await Booking.create(
      {
        bookingId,
        userId,
        tripId,
        pickupPointId: null,   // not used for personalize
        dropPointId:   null,   // not used for personalize
        bookingType:   'personalize',
        seats:         allSeatNumbers,
        seatCount:     allSeatNumbers.length,
        journeyDate:   new Date(journeyDate),

        journeyTime,
        passengerCount: paxCount,
        customerName:   fullName.trim(),
        flightTrainNumber: flightTrainNumber || null,
        // Store pickup address in specialRequests so it's visible everywhere
        specialRequests: pickupAddress.trim() + (specialRequests ? ` | ${specialRequests}` : ''),

        paymentMode,
        ...amounts,
        bookingStatus: 'initiated',
        selectedMeal:  selectedMeal || null,
        passengers:    null,
        priceBreakdown,
      },
      { transaction: t }
    );

    await Trip.update(
      { isFullyBooked: true },
      { where: { id: tripId }, transaction: t }
    );

    if (allSeats.length > 0) {
      await BookedSeat.bulkCreate(
        allSeats.map(seat => ({
          bookingId:   booking.id,
          tripId,
          seatNumber:  seat.seatNumber,
          seatPrice:   seat.price,
          isCancelled: false,
        })),
        { transaction: t }
      );
    }

    let paymentSessionId = null;
    if (amounts.paidAmount > 0) {
      const paymentResult = await paymentService.createOrder({
        orderId:      `ORDER_${booking.id}_${Date.now()}`,
        orderAmount:  amounts.paidAmount,
        customerEmail,
        customerPhone,
        customerId:   userId,
        bookingId:    booking.id,
      });

      await booking.update(
        {
          paymentOrderId:   paymentResult.order_id,
          paymentSessionId: paymentResult.payment_session_id,
          paymentExpiry:    new Date(Date.now() + 30 * 60 * 1000),
        },
        { transaction: t }
      );

      paymentSessionId = paymentResult.payment_session_id;
    }

    await t.commit();

    return {
      ...formatBookingResponse(booking, paymentSessionId),
      customerName:      booking.customerName,
      journeyTime:       booking.journeyTime,
      passengerCount:    booking.passengerCount,
      pickupAddress:     pickupAddress.trim(),
      flightTrainNumber: booking.flightTrainNumber,
      specialRequests:   booking.specialRequests,
      priceBreakdown:    booking.priceBreakdown,
    };

  } catch (error) {
    await t.rollback();
    await Trip.update({ isFullyBooked: false }, { where: { id: tripId } }).catch(() => {});
    throw error;
  }
},
 

  // ── Get user bookings ──────────────────────────────────────────────────────
  getUserBookings: async (userId) => {
    if (!userId || isNaN(parseInt(userId))) throw new BadRequest('Invalid user ID');

    const bookings = await Booking.findAll({
      where: { userId: parseInt(userId) },
      include: [
        {
          model: Trip, as: 'trip',
          include: [
            { model: Car,           as: 'Car',           attributes: ['id', 'carName', 'carType', 'cabType', 'registrationNumber', 'imageUrl'] },
            { model: StartLocation, as: 'startLocation', attributes: ['id', 'name'] },
            { model: EndLocation,   as: 'endLocation',   attributes: ['id', 'name'] }
          ]
        },
        { model: PickupPoint, as: 'pickupPoint', attributes: ['id', 'name'] },
        { model: DropPoint,   as: 'dropPoint',   attributes: ['id', 'name'] }
      ],
      attributes: [
        'id', 'bookingId', 'bookingType', 'seats', 'seatCount', 'cabinNumber',
        'totalAmount', 'paidAmount', 'remainingAmount',
        'paymentMode', 'paymentStatus', 'bookingStatus',
        'journeyDate', 'selectedMeal', 'priceBreakdown',
        'passengers',   // ← included
        'createdAt'
      ],
      order: [['created_at', 'DESC']]
    });

    return bookings.map(b => ({
      id:              b.id,
      bookingId:       b.bookingId,
      bookingType:     b.bookingType,
      paymentMode:     b.paymentMode,
      totalAmount:     b.totalAmount,
      paidAmount:      b.paidAmount,
      remainingAmount: b.remainingAmount,
      paymentStatus:   b.paymentStatus,
      bookingStatus:   b.bookingStatus,
      journeyDate:     b.journeyDate,
      seats:           b.seats,
      seatCount:       b.seatCount,
      cabinNumber:     b.cabinNumber,
      passengers:      b.passengers || [],   // ← returned
      selectedMeal:    b.selectedMeal,
      priceBreakdown:  b.priceBreakdown,
      trip: b.trip ? {
        id:        b.trip.id,
        route:     `${b.trip.startLocation?.name || ''} → ${b.trip.endLocation?.name || ''}`,
        startTime: b.trip.startTime,
        endTime:   b.trip.endTime,
        car: b.trip.Car ? {
          id:                 b.trip.Car.id,
          name:               b.trip.Car.carName,
          type:               b.trip.Car.carType,
          cabType:            b.trip.Car.cabType,
          registrationNumber: b.trip.Car.registrationNumber,
          imageUrl:           b.trip.Car.imageUrl,
        } : null
      } : null,
      pickupPoint: b.pickupPoint || null,
      dropPoint:   b.dropPoint   || null,
      createdAt:   b.createdAt,
    }));
  },

  // ── Get booking details ────────────────────────────────────────────────────
  getBookingDetails: async (bookingId) => {
    const booking = await Booking.findOne({
      where: { id: bookingId },
      include: [
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNo'] },
        {
          model: Trip, as: 'trip',
          include: [
            { model: Car,           as: 'Car',           attributes: ['id', 'carName', 'carType', 'cabType', 'registrationNumber', 'totalSeats', 'imageUrl'] },
            { model: StartLocation, as: 'startLocation', attributes: ['id', 'name'] },
            { model: EndLocation,   as: 'endLocation',   attributes: ['id', 'name'] }
          ]
        },
        { model: PickupPoint, as: 'pickupPoint', attributes: ['id', 'name'] },
        { model: DropPoint,   as: 'dropPoint',   attributes: ['id', 'name'] }
      ]
    });

    if (!booking) throw new NotFound('Booking not found');

    return {
      id:              booking.id,
      bookingId:       booking.bookingId,
      bookingType:     booking.bookingType,
      paymentMode:     booking.paymentMode,
      totalAmount:     booking.totalAmount,
      paidAmount:      booking.paidAmount,
      remainingAmount: booking.remainingAmount,
      paymentStatus:   booking.paymentStatus,
      bookingStatus:   booking.bookingStatus,
      journeyDate:     booking.journeyDate,
      seats:           booking.seats,
      seatCount:       booking.seatCount,
      cabinNumber:     booking.cabinNumber,
      passengers:      booking.passengers || [],   // ← returned
      selectedMeal:    booking.selectedMeal,
      priceBreakdown:  booking.priceBreakdown,
      user: booking.user ? {
        id:    booking.user.id,
        name:  `${booking.user.firstName || ''} ${booking.user.lastName || ''}`.trim(),
        email: booking.user.email,
        phone: booking.user.phoneNo,
      } : null,
      trip: booking.trip ? {
        id:        booking.trip.id,
        route:     `${booking.trip.startLocation?.name || ''} → ${booking.trip.endLocation?.name || ''}`,
        startTime: booking.trip.startTime,
        endTime:   booking.trip.endTime,
        car: booking.trip.Car ? {
          id:                 booking.trip.Car.id,
          name:               booking.trip.Car.carName,
          type:               booking.trip.Car.carType,
          cabType:            booking.trip.Car.cabType,
          registrationNumber: booking.trip.Car.registrationNumber,
          totalSeats:         booking.trip.Car.totalSeats,
          imageUrl:           booking.trip.Car.imageUrl,
        } : null
      } : null,
      pickupPoint: booking.pickupPoint || null,
      dropPoint:   booking.dropPoint   || null,
      createdAt:   booking.createdAt,
    };
  },

  // ── Admin: all bookings ─────────────────────��──────────────────────────────
  getBookingList: async (userId = null, { page = 1, limit = 10 } = {}) => {
    const where = {};
    if (userId) where.userId = parseInt(userId);

    const parsedPage  = parseInt(page,  10);
    const parsedLimit = parseInt(limit, 10);
    const offset      = (parsedPage - 1) * parsedLimit;

    const { count, rows: bookings } = await Booking.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNo'] },
        {
          model: Trip, as: 'trip',
          include: [
            { model: Car,           as: 'car',           attributes: ['id', 'carName', 'carType', 'cabType', 'registrationNumber'] },
            { model: StartLocation, as: 'startLocation', attributes: ['id', 'name'] },
            { model: EndLocation,   as: 'endLocation',   attributes: ['id', 'name'] }
          ]
        },
        { model: PickupPoint, as: 'pickupPoint', attributes: ['id', 'name'] },
        { model: DropPoint,   as: 'dropPoint',   attributes: ['id', 'name'] }
      ],
      order:  [['created_at', 'DESC']],
      limit:  parsedLimit,
      offset,
      distinct: true,
    });

    const data = bookings.map(b => ({
      id:              b.id,
      bookingId:       b.bookingId,
      bookingType:     b.bookingType,
      paymentMode:     b.paymentMode,
      totalAmount:     b.totalAmount,
      paidAmount:      b.paidAmount,
      remainingAmount: b.remainingAmount,
      paymentStatus:   b.paymentStatus,
      bookingStatus:   b.bookingStatus,
      journeyDate:     b.journeyDate,
      journeyTime:     b.journeyTime || null,
      seatCount:       b.seatCount,
      cabinNumber:     b.cabinNumber,
      passengers:      b.passengers || [],   // ← returned for admin too
      user: b.user ? {
        id:    b.user.id,
        name:  `${b.user.firstName || ''} ${b.user.lastName || ''}`.trim(),
        email: b.user.email,
        phone: b.user.phoneNo,
      } : null,
      trip: b.trip ? {
        route:     `${b.trip.startLocation?.name || ''} → ${b.trip.endLocation?.name || ''}`,
        startTime: b.trip.startTime || null,
        car:       b.trip.car?.carName || null,
        cabType:   b.trip.car?.cabType || null,
      } : null,
      pickupPoint: b.pickupPoint?.name || null,
      dropPoint:   b.dropPoint?.name   || null,
      createdAt:   b.createdAt,
    }));

    return {
      data,
      pagination: {
        total:      count,
        page:       parsedPage,
        limit:      parsedLimit,
        totalPages: Math.ceil(count / parsedLimit),
      },
    };
  },

  // ─��� Cancel booking ─────────────────────────────────────────────────────────
cancelBooking: async (bookingId, userId) => {
  const booking = await Booking.findByPk(bookingId, {
    include: [{ model: Trip, as: 'trip' }],
  });
 
  if (!booking)                        throw new NotFound('Booking not found');
  if (booking.userId !== userId)        throw new BadRequest('You can only cancel your own bookings');
  if (booking.bookingStatus === 'cancelled') throw new BadRequest('Booking is already cancelled');
  if (!['confirmed', 'initiated'].includes(booking.bookingStatus)) {
    throw new BadRequest(`Cannot cancel a booking with status: ${booking.bookingStatus}`);
  }
 
  const t = await sequelize.transaction();
 
  try {
    // ── 1. Mark booking cancelled ───────────────────────────────────────────
    await booking.update({ bookingStatus: 'cancelled' }, { transaction: t });
 
    // ── 2. Cancel all BookedSeat records ────────────────────────────────────
    await BookedSeat.update(
      { isCancelled: true },
      { where: { bookingId: booking.id }, transaction: t }
    );
 
    // ── 3. Release resources per booking type ───────────────────────────────
 
    if (booking.bookingType === 'sharing') {
      // Release individual seats — reset isBooked flag so search shows them available
      const seatNumbers = Array.isArray(booking.seats)
        ? booking.seats
        : JSON.parse(booking.seats || '[]');
 
      if (seatNumbers.length > 0) {
        await Seat.update(
          { isBooked: false },
          { where: { tripId: booking.tripId, seatNumber: seatNumbers }, transaction: t }
        );
      }
        // ✅ Restore available seats
  const seatsToRestore = seatNumbers.length;
  if (seatsToRestore > 0) {
    await Trip.increment('availableSeats', {
      by: seatsToRestore,
      where: { id: booking.tripId },
      transaction: t
    });
  }
 
    } else if (booking.bookingType === 'cabin') {
      // Cabin slot is freed by cancelled BookedSeat records
      // initiateCabinBooking checks Booking table (status != cancelled) so no extra step needed
      // But reset any Seat.isBooked flags if used
      const seatNumbers = Array.isArray(booking.seats)
        ? booking.seats
        : JSON.parse(booking.seats || '[]');
 
      if (seatNumbers.length > 0) {
        await Seat.update(
          { isBooked: false },
          { where: { tripId: booking.tripId, seatNumber: seatNumbers }, transaction: t }
        );
      }
        // ✅ Restore cabin seats — use seatsPerCabinSnapshot if available
  const seatsToRestore = seatNumbers.length;
  if (seatsToRestore > 0) {
    await Trip.increment('availableSeats', {
      by: seatsToRestore,
      where: { id: booking.tripId },
      transaction: t
    });
  }
 
    } else if (booking.bookingType === 'personalize') {
      // Personalize marks Trip.isFullyBooked = true on booking
      // Only unblock if no OTHER active personalize booking exists for same trip+date
      const otherActive = await Booking.findOne({
        where: {
          tripId:        booking.tripId,
          journeyDate:   booking.journeyDate,
          bookingType:   'personalize',
          bookingStatus: { [Op.not]: 'cancelled' },
          id:            { [Op.not]: booking.id },
        },
        transaction: t,
      });
 
      if (!otherActive) {
        await Trip.update(
          { isFullyBooked: false },
          { where: { id: booking.tripId }, transaction: t }
        );
      }
    }
 
    await t.commit();
    const notifService = require('./notificationService');
    const user = await User.findByPk(booking.userId);
    if (user) {
      const bookingWithDetails = await Booking.findByPk(booking.id, {
        include: [
          {
            model: Trip,
            as: 'trip',
            include: [
              { model: StartLocation, as: 'startLocation' },
              { model: EndLocation, as: 'endLocation' },
            ],
          },
        ],
      });

      // bookingWithDetails use karo, booking nahi
      notifService.notifyBookingCancelled(bookingWithDetails || booking, user)
        .catch(err => console.error('[Cancel Notification] Failed:', err.message));
    }
 
    return {
      success:     true,
      message:     'Booking cancelled successfully',
      bookingId:   booking.bookingId,
      bookingType: booking.bookingType,
    };
 
  } catch (error) {
    await t.rollback();
    throw error;
  }
},

  // ── Admin: update payment status ───────────────────────────────────────────
  updatePaymentStatus: async (bookingId, { paidAmount, paymentStatus }) => {
    const booking = await Booking.findByPk(bookingId);
    if (!booking) throw new NotFound('Booking not found');

    const newPaid   = parseFloat(paidAmount || booking.paidAmount);
    const remaining = parseFloat((booking.totalAmount - newPaid).toFixed(2));
    const newStatus = remaining <= 0 ? 'completed' : 'partial';

    await booking.update({
      paidAmount:      newPaid,
      remainingAmount: remaining < 0 ? 0 : remaining,
      paymentStatus:   paymentStatus || newStatus,
    });

    return { message: 'Payment status updated', booking: booking.get({ plain: true }) };
  },


  getAvailablePersonalizeCabs: async ({
  startLocationId,
  endLocationId,
  journeyDate,
  vehicleType
}) => {

  if (!startLocationId || !endLocationId || !journeyDate) {
    throw new Error('Missing required parameters');
  }

  const trips = await Trip.findAll({
    where: {
      startLocationId,
      endLocationId
    },

    include: [
      {
        model: Car,
        required: true,
        where: {
          cabType: 'personalize',

          ...(vehicleType && {
            vehicleCategory: { [Op.in]: vehicleType.split(',').map(v => v.trim()) }
          })
        }
      }
    ]
  });

  if (!trips.length) return [];

  const tripIds = trips.map(t => t.id);

  const bookedTrips = await Booking.findAll({
    where: {
      tripId: tripIds,
      journeyDate,
      bookingType: 'personalize',
      bookingStatus: {
        [Op.not]: 'cancelled'
      }
    },
    attributes: ['tripId']
  });

  const bookedTripIds = bookedTrips.map(b => b.tripId);

  return trips.filter(trip => !bookedTripIds.includes(trip.id));
}
};

module.exports = bookingService;
// const db = require('../db/models');
// const { Booking, BookedSeat, Trip, Seat, User, Car, StartLocation, EndLocation, PickupPoint, DropPoint } = db;

// // Ensure models are properly associated
// const { sequelize } = require('../db/database');
// const { Op } = require('sequelize');
// const { NotFound, BadRequest } = require('http-errors');
// const paymentService = require('./paymentService');
// // Helper function to generate the next booking ID
// const generateNextBookingId = async () => {
//   try {
//     // First, check if the bookingId column exists
//     const [results] = await sequelize.query(
//       `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
//        WHERE TABLE_SCHEMA = '${sequelize.config.database}' 
//        AND TABLE_NAME = 'Bookings' 
//        AND COLUMN_NAME = 'bookingId'`
//     );
    
//     // If bookingId column doesn't exist yet, return a timestamp-based ID
//     if (results.length === 0) {
//       return `TMP${Date.now().toString().slice(-8)}`;
//     }
    
//     // Start a transaction to ensure no race conditions
//     const transaction = await sequelize.transaction();
    
//     try {
//       // Get the last booking with a bookingId
//       const lastBooking = await Booking.findOne({
//         attributes: ['bookingId'],
//         where: {
//           bookingId: {
//             [Op.like]: 'EC%'
//           }
//         },
//         order: [['id', 'DESC']],
//         transaction,
//         lock: transaction.LOCK.UPDATE // Lock the row for update
//       });

//       let nextNumber = 1;
      
//       if (lastBooking && lastBooking.bookingId) {
//         // Extract the number part and increment
//         const lastNumber = parseInt(lastBooking.bookingId.replace('EC', ''), 10);
//         if (!isNaN(lastNumber)) {
//           nextNumber = lastNumber + 1;
//         }
//       }

//       // Format the new booking ID (EC followed by 4-digit number)
//       const bookingId = `EC${nextNumber.toString().padStart(4, '0')}`;
      
//       await transaction.commit();
//       return bookingId;
//     } catch (error) {
//       await transaction.rollback();
//       console.error('Error generating booking ID:', error);
//       // Fallback to timestamp-based ID if there's an error
//       return `EC${Date.now().toString().slice(-4)}`;
//     }
//   } catch (error) {
//     console.error('Error checking for bookingId column:', error);
//     // Fallback to timestamp-based ID if we can't check the column
//     return `TMP${Date.now().toString().slice(-8)}`;
//   }
// };

// const bookingService = {
//   //   const { userId, tripId, pickupPointId, dropPointId, selectedSeats, totalAmount, customerEmail, customerPhone } = bookingData;

//   //   // Validate user exists
//   //   const user = await User.findByPk(userId);
//   //   if (!user) {
//   //     throw new BadRequest('User not found');
//   //   }

//   //   // Validate trip exists and is active
//   //   const trip = await Trip.findByPk(tripId);
//   //   if (!trip) {
//   //     throw new BadRequest('Trip not found');
//   //   }
//   //   if (trip.status !== true) {
//   //     throw new BadRequest('Trip is not active');
//   //   }

//   //   // Validate selected seats exist and are available
//   //   const seatRecords = await Seat.findAll({
//   //     where: { 
//   //       tripId: tripId, 
//   //       seatNumber: selectedSeats,
//   //       isBooked: 0 // Only consider available seats
//   //     }
//   //   });

//   //   // Check if all selected seats exist and are available
//   //   if (seatRecords.length !== selectedSeats.length) {
//   //     const foundSeatNumbers = seatRecords.map(s => s.seatNumber);
//   //     const missingSeats = selectedSeats.filter(seat => !foundSeatNumbers.includes(seat));
//   //     throw new BadRequest(`Some selected seats are not available: ${missingSeats.join(', ')}`);
//   //   }

//   //   // Check if any seats are already booked (shouldn't happen with the query above, but good to double-check)
//   //   const bookedSeats = seatRecords.filter(seat => seat.isBooked === 1);
//   //   if (bookedSeats.length > 0) {
//   //     throw new BadRequest(`Seats ${bookedSeats.map(s => s.seatNumber).join(', ')} are already booked`);
//   //   }

//   //   // Calculate total amount (should match provided totalAmount)
//   //   const calculatedTotal = seatRecords.reduce((sum, seat) => sum + parseFloat(seat.price), 0);
//   //   if (Math.abs(calculatedTotal - totalAmount) > 0.01) {
//   //     throw new BadRequest('Total amount does not match seat prices');
//   //   }

//   //   // Use transaction for atomicity
//   //   const t = await sequelize.transaction();
//   //   let booking;

//   //   try {
//   //     // Create booking with initiated status
//   //     booking = await Booking.create({
//   //       userId,
//   //       tripId,
//   //       pickupPointId,
//   //       dropPointId,
//   //       seats: selectedSeats,
//   //       totalAmount,
//   //       paymentStatus: 'pending',
//   //       bookingStatus: 'initiated',
//   //     }, { transaction: t });

//   //     // Create BookedSeat records (temporarily locked)
//   //     const bookedSeatsData = seatRecords.map(seat => ({
//   //       bookingId: booking.id,
//   //       tripId,
//   //       seatNumber: seat.seatNumber,
//   //       seatPrice: seat.price,
//   //       isCancelled: false,
//   //     }));

//   //     await BookedSeat.bulkCreate(bookedSeatsData, { transaction: t });

//   //     // Mark seats as booked in Seats table
//   //     await Seat.update(
//   //       { isBooked: 1 },
//   //       { 
//   //         where: { 
//   //           tripId: tripId, 
//   //           seatNumber: selectedSeats 
//   //         }, 
//   //         transaction: t 
//   //       }
//   //     );

//   //     // Generate payment order
//   //     const paymentResult = await paymentService.createOrder({
//   //       orderAmount: totalAmount,
//   //       customerEmail,
//   //       customerPhone,
//   //       customer_id: userId,
//   //       bookingId: booking.id,
//   //     });

//   //     // Update booking with payment details
//   //     await booking.update({
//   //       paymentOrderId: paymentResult.order_id,
//   //       paymentSessionId: paymentResult.payment_session_id,
//   //       paymentExpiry: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes expiry
//   //     }, { transaction: t });

//   //     await t.commit();

//   //     return {
//   //       ...booking.get({ plain: true }),
//   //       paymentSessionId: paymentResult.payment_session_id
//   //     };
//   //   } catch (error) {
//   //     await t.rollback();
//   //     throw error;
//   //   }
//   // },
//   initiateBooking: async (bookingData) => {
//     const {
//       userId,
//       tripId,
//       pickupPointId,
//       dropPointId,
//       selectedSeats,
//       totalAmount, // This is now the subtotal (before discount)
//       customerEmail,
//       customerPhone,
//       selectedMeal,
//       addons, // optional array of extras [{type, price}, ...]
//       discountAmount = 0, // New: discount amount from coupon
//       couponCode = null,  // New: coupon code if applied
//       finalPayableAmount, // New: total after discount
//       journeyDate, // New: The date for which the booking is being made (YYYY-MM-DD)
//     } = bookingData;
    
//     // Validate journeyDate format
//     if (!journeyDate || !/^\d{4}-\d{2}-\d{2}$/.test(journeyDate)) {
//       throw new BadRequest('Valid journeyDate (YYYY-MM-DD) is required');
//     }
  
//     // Validate user exists
//     const user = await User.findByPk(userId);
//     if (!user) throw new BadRequest("User not found");
  
//     // Validate trip exists and is active
//     const trip = await Trip.findByPk(tripId);
//     if (!trip) throw new BadRequest("Trip not found");
//     if (trip.status !== true) throw new BadRequest("Trip is not active");
    
//     // Validate journeyDate against trip schedule
//     const tripStartDate = new Date(trip.startTime).toISOString().split('T')[0];
    
//     if (!trip.isRecurring) {
//       // For non-recurring trips, journeyDate must match the trip's start date
//       if (journeyDate !== tripStartDate) {
//         throw new BadRequest(`This is a one-time trip and is only available on ${tripStartDate}`);
//       }
//     } else {
//       // For recurring trips, journeyDate must be on or after the trip's start date
//       if (journeyDate < tripStartDate) {
//         throw new BadRequest(`Journey date cannot be before the trip start date (${tripStartDate})`);
//       }
//     }
  
//     // Check for seat availability for the specific journey date
//     const existingBookings = await Booking.findAll({
//       where: {
//         tripId,
//         journeyDate: new Date(journeyDate),
//         paymentStatus: 'completed'
//       },
//       raw: true,
//     });
    
//     // Get all seat numbers that are already booked for this trip on this date
//     const bookedSeatNumbers = new Set();
//     existingBookings.forEach(booking => {
//       try {
//         const seats = Array.isArray(booking.seats) ? booking.seats : JSON.parse(booking.seats || '[]');
//         seats.forEach(seat => {
//           if (typeof seat === 'object' && seat.seatNumber) {
//             bookedSeatNumbers.add(seat.seatNumber);
//           } else if (typeof seat === 'string' || typeof seat === 'number') {
//             bookedSeatNumbers.add(seat);
//           }
//         });
//       } catch (e) {
//         console.error('Error parsing seats for booking:', booking.id, e);
//       }
//     });
    
//     // Check if any selected seats are already booked
//     const alreadyBookedSeats = selectedSeats.filter(seat => bookedSeatNumbers.has(seat));
//     if (alreadyBookedSeats.length > 0) {
//       throw new BadRequest(`Seat(s) ${alreadyBookedSeats.join(', ')} are already booked for the selected date`);
//     }
    
//     // Get seat records for the selected seats
//     const seatRecords = await Seat.findAll({
//       where: {
//         tripId,
//         seatNumber: selectedSeats,
//         // isBooked: 0, // Only available seats
//       },
//     });
  
//     // Check if all selected seats are valid
//     if (seatRecords.length !== selectedSeats.length) {
//       const foundSeats = seatRecords.map((s) => s.seatNumber);
//       const missingSeats = selectedSeats.filter(
//         (s) => !foundSeats.includes(s)
//       );
//       throw new BadRequest(
//         `Some selected seats are not available: ${missingSeats.join(", ")}`
//       );
//     }
  
//     // Double-check no seat is already booked (safety)
//     // const alreadyBooked = seatRecords.filter((s) => s.isBooked === 1);
//     // if (alreadyBooked.length > 0) {
//     //   throw new BadRequest(
//     //     `Seats ${alreadyBooked.map((s) => s.seatNumber).join(", ")} are already booked`
//     //   );
//     // }
  
//     // --- 💰 PRICE CALCULATION (Modular & Scalable) ---
//     const seatTotal = seatRecords.reduce(
//       (sum, seat) => sum + parseFloat(seat.price || 0),
//       0
//     );
  
//     let extrasTotal = 0;
//     const breakdown = {
//       seatTotal,
//       extras: [],
//       subtotal: 0, // Will be set after calculating extras
//       coupon: null
//     };
  
//     // Include meal (if exists)
//     if (selectedMeal?.price) {
//       const mealPrice = parseFloat(selectedMeal.price);
//       extrasTotal += mealPrice;
//       breakdown.extras.push({
//         type: selectedMeal.type || "Meal",
//         price: mealPrice,
//       });
//     }
  
//     // Include addons (if any)
//     if (Array.isArray(addons) && addons.length > 0) {
//       addons.forEach((addon) => {
//         const addonPrice = parseFloat(addon.price || 0);
//         extrasTotal += addonPrice;
//         breakdown.extras.push({
//           type: addon.type || "Addon",
//           price: addonPrice,
//         });
//       });
//     }
  
//     const calculatedSubtotal = seatTotal + extrasTotal;
//     breakdown.subtotal = calculatedSubtotal;
    
//     // Add coupon details to breakdown if coupon is applied
//     if (couponCode) {
//       breakdown.coupon = {
//         code: couponCode,
//         discount: parseFloat(discountAmount) || 0,
//         finalAmount: parseFloat(finalPayableAmount) || calculatedSubtotal
//       };
//     }
  
//     // Validate subtotal amount (before discount)
//     if (Math.abs(calculatedSubtotal - totalAmount) > 0.01) {
//       throw new BadRequest(
//         `Subtotal amount mismatch. Expected ${calculatedSubtotal}, received ${totalAmount}`
//       );
//     }
    
//     // Validate final payable amount (after discount)
//     const expectedFinal = calculatedSubtotal - (parseFloat(discountAmount) || 0);
//     if (Math.abs(expectedFinal - parseFloat(finalPayableAmount)) > 0.01) {
//       throw new BadRequest(
//         `Final payable amount mismatch. Expected ${expectedFinal}, received ${finalPayableAmount}`
//       );
//     }
  
//     // --- TRANSACTION FOR ATOMICITY ---
//     const t = await sequelize.transaction();
//     let booking;
  
//     try {
//       // Generate the next booking ID
//       const bookingId = await generateNextBookingId();
      
//       // Create booking with initiated status
//       booking = await Booking.create(
//         {
//           bookingId,
//           userId,
//           tripId,
//           pickupPointId,
//           dropPointId,
//           seats: selectedSeats,
//           journeyDate: new Date(journeyDate),
//           subtotalAmount: totalAmount, // Store subtotal (before discount)
//           discountAmount: parseFloat(discountAmount) || 0,
//           couponCode: couponCode,
//           totalAmount: parseFloat(finalPayableAmount), // Store final payable amount
//           paymentStatus: "pending",
//           bookingStatus: "initiated",
//           priceBreakdown: breakdown, // 💾 Store detailed breakdown
//           selectedMeal: selectedMeal
//         },
//         { transaction: t }
//       );
  
//       // Create BookedSeat records
//       const bookedSeatsData = seatRecords.map((seat) => ({
//         bookingId: booking.id,
//         tripId,
//         seatNumber: seat.seatNumber,
//         seatPrice: seat.price,
//         isCancelled: false,
//       }));
  
//       await BookedSeat.bulkCreate(bookedSeatsData, { transaction: t });
  
//       // Mark seats as booked
//       // await Seat.update(
//       //   { isBooked: 1 },
//       //   {
//       //     where: {
//       //       tripId,
//       //       seatNumber: selectedSeats,
//       //     }
//       //   },
//       //   { transaction: t }
//       // );

//       // Create payment order with the final payable amount (after discount)
//       const paymentResult = await paymentService.createOrder({
//         orderId: `ORDER_${booking.id}_${Date.now()}`,
//         orderAmount: parseFloat(finalPayableAmount), // Use final amount after discount
//         customerEmail,
//         customerPhone,
//         customerId: userId,
//         bookingId: booking.id,
//       });

//       // Update booking with payment details
//       await booking.update({
//         paymentOrderId: paymentResult.order_id,
//         paymentSessionId: paymentResult.payment_session_id,
//         paymentExpiry: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes expiry
//       }, { transaction: t });
  
//       await t.commit();
  
//       return {
//         ...booking.get({ plain: true }),
//         paymentSessionId: paymentResult.payment_session_id,
//       };
//     } catch (error) {
//       await t.rollback();
//       throw error;
//     }
//   },
  
//   getUserBookings: async (userId) => {
//     try {
//       // Validate userId
//       if (!userId || isNaN(parseInt(userId))) {
//         throw new Error('Invalid user ID');
//       }
      
//       // Import models directly to avoid circular dependencies
//       const Booking = require('../db/models/Booking');
//       const Trip = require('../db/models/Trip');
//       const Car = require('../db/models/Car');
//       const StartLocation = require('../db/models/StartLocation');
//       const EndLocation = require('../db/models/EndLocation');
      
//       const bookings = await Booking.findAll({
//         where: { userId: parseInt(userId) },
//         include: [
//           {
//             model: Trip,
//             as: 'trip',
//             include: [
//               {
//                 model: Car,
//                 as: 'Car',
//                 attributes: ['id', 'carName', 'carType', 'registrationNumber']
//               },
//               {
//                 model: StartLocation,
//                 as: 'startLocation',
//                 attributes: ['id', 'name']
//               },
//               {
//                 model: EndLocation,
//                 as: 'endLocation',
//                 attributes: ['id', 'name']
//               }
//             ]
//           }
//         ],
//         attributes: ['id', 'seats', 'totalAmount', 'paymentStatus', 'bookingStatus'],
//       });

//       return bookings || [];
//     } catch (error) {
//       console.error('Error in getUserBookings:', error);
//       throw error;
//     }
//   },

//   getBookingDetails: async (bookingId) => {
//     const booking = await Booking.findOne({
//       where: { id: bookingId },
//       include: [
//         {
//           model: User,
//           as: 'user',
//           attributes: ['id', 'firstName', 'lastName', 'email', 'phone']
//         },
//         {
//           model: Trip,
//           as: 'trip',
//           include: [
//             {
//               model: Car,
//               as: 'car',
//               attributes: ['id', 'name', 'type', 'registrationNumber', 'totalSeats']
//             },
//             {
//               model: StartLocation,
//               as: 'startLocation',
//               attributes: ['id', 'name']
//             },
//             {
//               model: EndLocation,
//               as: 'endLocation',
//               attributes: ['id', 'name']
//             }
//           ]
//         },
//         {
//           model: PickupPoint,
//           as: 'pickupPoint',
//           attributes: ['id', 'name']
//         },
//         {
//           model: DropPoint,
//           as: 'dropPoint',
//           attributes: ['id', 'name']
//         }
//       ],
//       attributes: [
//         'id', 
//         'seats', 
//         'totalAmount', 
//         'bookingStatus', 
//         'paymentStatus',
//         'createdAt', 
//         'pickupPointId', 
//         'dropPointId',
//         'tripId',
//         'userId',
//         'selectedMeal',
//         'priceBreakdown'
//       ]
//     });

//     if (!booking) {
//       throw new NotFound('Booking not found');
//     }

//     // Format the response
//     return {
//       id: booking.id,
//       user: booking.User ? {
//         id: booking.User.id,
//         name: `${booking.User.firstName || ''} ${booking.User.lastName || ''}`.trim() || 'Unknown',
//         email: booking.User.email,
//         phone: booking.User.phone
//       } : { id: null, name: 'Unknown' },
//       trip: booking.trip ? {
//         id: booking.trip.id,
//         route: booking.trip.startLocation && booking.trip.endLocation 
//           ? `${booking.trip.startLocation.name} → ${booking.trip.endLocation.name}`
//           : 'Unknown Route',
//         startLocation: booking.trip.startLocation,
//         endLocation: booking.trip.endLocation,
//         startTime: booking.trip.startTime,
//         endTime: booking.trip.endTime,
//         duration: booking.trip.duration,
//         car: booking.trip.car ? {
//           id: booking.trip.car.id,
//           name: booking.trip.car.name,
//           type: booking.trip.car.type,
//           registrationNumber: booking.trip.car.registrationNumber,
//           totalSeats: booking.trip.car.totalSeats
//         } : null
//       } : null,
//       pickupPoint: booking.pickupPoint || null,
//       dropPoint: booking.dropPoint || null,
//       seats: booking.seats,
//     };
//   },

//   getBookingList: async (userId = null) => {
//     try {
//       // Import models directly from the models directory to avoid circular dependencies
//       const Booking = require('../db/models/Booking');
//       const User = require('../db/models/User');
//       const Trip = require('../db/models/Trip');
//       const Car = require('../db/models/Car');
//       const StartLocation = require('../db/models/StartLocation');
//       const EndLocation = require('../db/models/EndLocation');
//       const PickupPoint = require('../db/models/PickupPoint');
//       const DropPoint = require('../db/models/DropPoint');
      
//       // If userId is provided, ensure it's a valid number
//       if (userId !== null && (isNaN(parseInt(userId)) || parseInt(userId) <= 0)) {
//         throw new Error('Invalid user ID');
//       }
      
//       // Ensure models are properly associated
//       const db = require('../db/models');
      
//       // Define the query options with explicit includes and aliases
//       const options = {
//         include: [
//           {
//             model: User,
//             as: 'user',
//             attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNo']
//           },
//           {
//             model: Trip,
//             as: 'trip',
//             include: [
//               {
//                 model: Car,
//                 as: 'Car',
//                 attributes: ['id', 'carName', 'carType', 'registrationNumber']
//               },
//               {
//                 model: StartLocation,
//                 as: 'startLocation',
//                 attributes: ['id', 'name']
//               },
//               {
//                 model: EndLocation,
//                 as: 'endLocation',
//                 attributes: ['id', 'name']
//               }
//             ]
//           },
//           {
//             model: PickupPoint,
//             as: 'pickupPoint',
//             attributes: ['id', 'name']
//           },
//           {
//             model: DropPoint,
//             as: 'dropPoint',
//             attributes: ['id', 'name']
//           }
//         ],
//         order: [['created_at', 'DESC']]
//       };
      
//       if (userId) {
//         options.where = { userId };
//       }
      
//       // Execute the query
//       const bookings = await Booking.findAll(options);
      
//       if (!bookings || bookings.length === 0) return [];
      
//       // Format the response
//       return bookings.map(booking => ({
//         id: booking.id,
//         user: booking.user ? {
//           id: booking.user.id,
//           firstName: booking.user.firstName,
//           lastName: booking.user.lastName,
//           email: booking.user.email,
//           phone: booking.user.phone
//         } : null,
//         trip: booking.trip ? {
//           id: booking.trip.id,
//           car: booking.trip.car ? {
//             id: booking.trip.car.id,
//             name: booking.trip.car.name,
//             type: booking.trip.car.type,
//             registrationNumber: booking.trip.car.registrationNumber
//           } : null,
//           startLocation: booking.trip.startLocation ? {
//             id: booking.trip.startLocation.id,
//             name: booking.trip.startLocation.name
//           } : null,
//           endLocation: booking.trip.endLocation ? {
//             id: booking.trip.endLocation.id,
//             name: booking.trip.endLocation.name
//           } : null
//         } : null,
//         pickupPoint: booking.pickupPoint ? {
//           id: booking.pickupPoint.id,
//           name: booking.pickupPoint.name
//         } : null,
//         dropPoint: booking.dropPoint ? {
//           id: booking.dropPoint.id,
//           name: booking.dropPoint.name
//         } : null,
//         seats: booking.seats,
//         totalAmount: booking.totalAmount,
//         bookingStatus: booking.bookingStatus,
//         paymentStatus: booking.paymentStatus,
//         selectedMeal: booking.selectedMeal,
//         priceBreakdown: booking.priceBreakdown,
//         createdAt: booking.createdAt
//       }));
//     } catch (error) {
//       console.error('Error in getBookingList:', error);
//       throw error;
//     }
    
//     try {
//       const [bookings] = await sequelize.query(query, {
//         replacements,
//         type: sequelize.QueryTypes.SELECT,
//         nest: true
//       });
      
//       if (!bookings || bookings.length === 0) return [];
      
//       // Format the results to match the expected structure
//       return bookings.map(booking => ({
//         id: booking.id,
//         user: {
//           id: booking['user.id'],
//           firstName: booking['user.firstName'],
//           lastName: booking['user.lastName'],
//           email: booking['user.email'],
//           phone: booking['user.phone']
//         },
//         trip: booking['trip.id'] ? {
//           id: booking['trip.id'],
//           car: booking['trip.car.id'] ? {
//             id: booking['trip.car.id'],
//             name: booking['trip.car.name'],
//             type: booking['trip.car.type'],
//             registrationNumber: booking['trip.car.registrationNumber']
//           } : null,
//           startLocation: booking['trip.startLocation.id'] ? {
//             id: booking['trip.startLocation.id'],
//             name: booking['trip.startLocation.name']
//           } : null,
//           endLocation: booking['trip.endLocation.id'] ? {
//             id: booking['trip.endLocation.id'],
//             name: booking['trip.endLocation.name']
//           } : null
//         } : null,
//         pickupPoint: booking['pickupPoint.id'] ? {
//           id: booking['pickupPoint.id'],
//           name: booking['pickupPoint.name']
//         } : null,
//         dropPoint: booking['dropPoint.id'] ? {
//           id: booking['dropPoint.id'],
//           name: booking['dropPoint.name']
//         } : null,
//         seats: booking.seats,
//         totalAmount: booking.totalAmount,
//         bookingStatus: booking.bookingStatus,
//         paymentStatus: booking.paymentStatus,
//         selectedMeal: booking.selectedMeal,
//         priceBreakdown: booking.priceBreakdown,
//         createdAt: booking.createdAt
//       }));
//     } catch (error) {
//       console.error('Error fetching booking list:', error);
//       throw error;
//     }
//   },


//   cancelBooking: async (bookingId) => {
//     const booking = await Booking.findByPk(bookingId);
//     if (!booking) {
//       throw new NotFound('Booking not found');
//     }

//     if (booking.bookingStatus === 'cancelled') {
//       throw new BadRequest('Booking is already cancelled');
//     }

//     // Use transaction
//     const t = await sequelize.transaction();

//     try {
//       // Update booking status
//       await booking.update({ bookingStatus: 'cancelled' }, { transaction: t });

//       // Mark seats as available
//       // await Seat.update(
//       //   { isAvailable: true },
//       //   { where: { tripId: booking.tripId, seatNumber: booking.seats }, transaction: t }
//       // );

//       // Mark BookedSeat as cancelled
//       await BookedSeat.update(
//         { isCancelled: true },
//         { where: { bookingId }, transaction: t }
//       );

//       await t.commit();
//       return { message: 'Booking cancelled successfully' };
//     } catch (error) {
//       await t.rollback();
//       throw error;
//     }
//   },
// };

// module.exports = bookingService;
