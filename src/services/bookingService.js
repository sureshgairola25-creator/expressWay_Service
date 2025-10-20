const { Booking, BookedSeat, Trip, SeatPricing, User, Car, StartLocation, EndLocation, sequelize } = require('../db/models');
const { NotFound, BadRequest } = require('http-errors');
const bookingService = {
  initiateBooking: async (bookingData) => {
    const { userId, tripId, selectedSeats, totalAmount } = bookingData;

    // Validate user exists
    const user = await User.findByPk(userId);
    if (!user) {
      throw new BadRequest('User not found');
    }

    // Validate trip exists and is active
    const trip = await Trip.findByPk(tripId);
    if (!trip) {
      throw new BadRequest('Trip not found');
    }
    if (trip.status !== true) {
      throw new BadRequest('Trip is not active');
    }

    // Validate selected seats exist and are available
    const seatPricingRecords = await SeatPricing.findAll({
      where: { tripId, seatNumber: selectedSeats }
    });

    if (seatPricingRecords.length !== selectedSeats.length) {
      throw new BadRequest('Some selected seats do not exist for this trip');
    }

    // Check if seats are available (not booked)
    const unavailableSeats = seatPricingRecords.filter(seat => seat.isBooked);
    if (unavailableSeats.length > 0) {
      throw new BadRequest(`Seats ${unavailableSeats.map(s => s.seatNumber).join(', ')} are already booked`);
    }

    // Calculate total amount (should match provided totalAmount)
    const calculatedTotal = seatPricingRecords.reduce((sum, seat) => sum + seat.price, 0);
    if (Math.abs(calculatedTotal - totalAmount) > 0.01) {
      throw new BadRequest('Total amount does not match seat prices');
    }

    // Use transaction for atomicity
    const t = await sequelize.transaction();

    try {
      // Create booking with initiated status
      const booking = await Booking.create({
        userId,
        tripId,
        seats: selectedSeats,
        totalAmount,
        paymentStatus: 'pending',
        bookingStatus: 'initiated',
      }, { transaction: t });

      // Create BookedSeat records (temporarily locked)
      // const bookedSeatsData = seatPricingRecords.map(seat => ({
      //   bookingId: booking.id,
      //   tripId,
      //   seatNumber: seat.seatNumber,
      //   seatPrice: seat.price,
      //   isCancelled: false,
      // }));

      // await BookedSeat.bulkCreate(bookedSeatsData, { transaction: t });

      // // Temporarily lock seats in SeatPricing
      // await SeatPricing.update(
      //   { isBooked: true },
      //   { where: { tripId, seatNumber: selectedSeats }, transaction: t }
      // );

      await t.commit();

      return booking;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  getUserBookings: async (userId) => {
    const bookings = await Booking.findAll({
      where: { userId },
      include: [
        {
          model: Trip,
          include: [
            {
              model: Car,
              attributes: ['carName', 'carType'],
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
      ],
      attributes: ['id', 'seats', 'totalAmount', 'paymentStatus', 'bookingStatus', 'createdAt'],
    });

    return bookings;
  },

  getBookingDetails: async (bookingId) => {
    const booking = await Booking.findByPk(bookingId, {
      include: [
        {
          model: Trip,
          include: [
            {
              model: Car,
              attributes: ['carName', 'carType'],
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

  cancelBooking: async (bookingId) => {
    const booking = await Booking.findByPk(bookingId);
    if (!booking) {
      throw new NotFound('Booking not found');
    }

    if (booking.bookingStatus === 'cancelled') {
      throw new BadRequest('Booking is already cancelled');
    }

    // Use transaction
    const t = await sequelize.transaction();

    try {
      // Update booking status
      await booking.update({ bookingStatus: 'cancelled' }, { transaction: t });

      // Mark seats as available
      await SeatPricing.update(
        { isBooked: false },
        { where: { tripId: booking.tripId, seatNumber: booking.seats }, transaction: t }
      );

      // Mark BookedSeat as cancelled
      await BookedSeat.update(
        { isCancelled: true },
        { where: { bookingId }, transaction: t }
      );

      await t.commit();
      return { message: 'Booking cancelled successfully' };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};

module.exports = bookingService;
