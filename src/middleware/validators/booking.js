// validation/bookingValidation.js
// ─────────────────────────────────────────────────────────────────────────────

const { BadRequest } = require('http-errors');

const DATE_REGEX  = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10}$/;

// ─────────────────────────────────────────────────────────────────────────────
// Validate a single passenger object
// ─────────────────────────────────────────────────────────────────────────────
const validatePassenger = (passenger, index) => {
  const label = `Passenger ${index + 1}`;

  if (!passenger.fullName || passenger.fullName.trim() === '') {
    throw new BadRequest(`${label}: fullName is required`);
  }

  if (!passenger.age || isNaN(parseInt(passenger.age)) ||
      parseInt(passenger.age) < 1 || parseInt(passenger.age) > 120) {
    throw new BadRequest(`${label}: valid age (1–120) is required`);
  }

  if (!['male', 'female', 'other'].includes(passenger.gender?.toLowerCase())) {
    throw new BadRequest(`${label}: gender must be male, female, or other`);
  }

  if (!passenger.phone || !PHONE_REGEX.test(passenger.phone)) {
    throw new BadRequest(`${label}: valid 10-digit phone number is required`);
  }

  if (!passenger.email || !EMAIL_REGEX.test(passenger.email)) {
    throw new BadRequest(`${label}: valid email is required`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Validate passengers array — count must match expectedCount
// ─────────────────────────────────────────────────────────────────────────────
const validatePassengers = (passengers, expectedCount, label = 'seats') => {
  if (!Array.isArray(passengers) || passengers.length === 0) {
    throw new BadRequest(
      `At least 1 passenger detail is required`
    );
  }
  // ✅ Count check removed — only validate what's provided
  // Max check still applies
  if (passengers.length > expectedCount) {
    throw new BadRequest(
      `Too many passengers. Maximum ${expectedCount} for ${expectedCount} ${label}`
    );
  }
  passengers.forEach((p, i) => validatePassenger(p, i));
};

// ─────────────────────────────────────────────────────────────────────────────
// Common fields validation
// ─────────────────────────────────────────────────────────────────────────────
const validateCommon = (body) => {
  const {
    userId, tripId, pickupPointId, dropPointId, journeyDate,
    paymentMode, paidAmount, totalAmount, customerEmail, customerPhone
  } = body;

  if (!userId)        throw new BadRequest('userId is required');
  if (!tripId)        throw new BadRequest('tripId is required');
  if (!pickupPointId) throw new BadRequest('pickupPointId is required');
  if (!dropPointId)   throw new BadRequest('dropPointId is required');
  if (!customerEmail) throw new BadRequest('customerEmail is required');
  if (!customerPhone) throw new BadRequest('customerPhone is required');

  if (!journeyDate || !DATE_REGEX.test(journeyDate)) {
    throw new BadRequest('Valid journeyDate (YYYY-MM-DD) is required');
  }

  if (!['full', 'partial'].includes(paymentMode)) {
    throw new BadRequest('paymentMode must be "full" or "partial"');
  }

  if (isNaN(parseFloat(totalAmount)) || parseFloat(totalAmount) <= 0) {
    throw new BadRequest('totalAmount must be a positive number');
  }

  if (isNaN(parseFloat(paidAmount)) || parseFloat(paidAmount) <= 0) {
    throw new BadRequest('paidAmount must be a positive number');
  }

  // if (paymentMode === 'full' && parseFloat(paidAmount) < parseFloat(totalAmount)) {
  //   throw new BadRequest('For full payment, paidAmount must equal totalAmount');
  // }

  // if (paymentMode === 'partial' && parseFloat(paidAmount) >= parseFloat(totalAmount)) {
  //   throw new BadRequest('For partial payment, paidAmount must be less than totalAmount');
  // }
};

// ─────────────────────────────────────────────────────────────────────────────
// Sharing cab — passengers count must match selected seats count
// ─────────────────────────────────────────────────────────────────────────────
const validateSharingBooking = (body) => {
  validateCommon(body);

  const { selectedSeats, passengers } = body;

  if (!Array.isArray(selectedSeats) || selectedSeats.length === 0) {
    throw new BadRequest('selectedSeats must be a non-empty array for sharing cab');
  }

  // Validate passengers — one per seat
  validatePassengers(passengers, selectedSeats.length, 'seats');
};

// ─────────────────────────────────────────────────────────────────────────────
// Cabin cab — passengers count must match cabin capacity
// cabinCapacity is passed from frontend based on car info
// ─────────────────────────────────────────────────────────────────────────────
const validateCabinBooking = (body) => {
  validateCommon(body);

  const { cabinNumber, cabinCapacity, cabinCount = 1, passengers } = body;

  if (!cabinNumber || isNaN(parseInt(cabinNumber))) {
    throw new BadRequest('cabinNumber is required for cabin cab booking');
  }

  if (!cabinCapacity || isNaN(parseInt(cabinCapacity)) || parseInt(cabinCapacity) < 1) {
    throw new BadRequest('cabinCapacity is required for cabin cab booking');
  }
    // ✅ FIX — total passengers = cabinCapacity × cabinCount
  const totalCabinCount     = parseInt(cabinCount) || 1;
  const totalSeatsBooked    = parseInt(cabinCapacity) * totalCabinCount;

  // Validate passengers — one per seat in the cabin
  validatePassengers(passengers, totalSeatsBooked, 'cabin seats');
};

// ─────────────────────────────────────────────────────────────────────────────
// Personalize cab — no passenger validation needed
// ─────────────────────────────────────────────────────────────────────────────
const validatePersonalizeBooking = (body) => {
  // validateCommon(body); // existing common checks
 
  const {
    fullName, passengerCount,
    pickupAddress, dropAddress,
    journeyDate, journeyTime,
  } = body;
 
  if (!fullName || fullName.trim() === '') {
    throw new BadRequest('fullName is required');
  }
 
  if (!pickupAddress || !pickupAddress.trim()) {
    throw new BadRequest('pickupAddress is required');
  }
 
  if (!dropAddress || !dropAddress.trim()) {
    throw new BadRequest('dropAddress is required');
  }
  if(!journeyDate || journeyDate.trim() === '') {
    throw new BadRequest('journeyDate is required');
  }
 
  if (!journeyTime || journeyTime.trim() === '') {
    throw new BadRequest('journeyTime is required (HH:MM format)');
  }
 
  if (
    !passengerCount ||
    isNaN(parseInt(passengerCount)) ||
    parseInt(passengerCount) < 1
  ) {
    throw new BadRequest('passengerCount must be at least 1');
  }
};


module.exports = {
  validateSharingBooking,
  validateCabinBooking,
  validatePersonalizeBooking,
  validatePassengers,
};