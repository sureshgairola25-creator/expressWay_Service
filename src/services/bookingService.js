const { Booking, BookedSeat, Trip, Seat, User, Car, StartLocation, EndLocation, sequelize, PickupPoint, DropPoint } = require('../db/models');
const { Op } = require('sequelize');
const { NotFound, BadRequest } = require('http-errors');
const paymentService = require('./paymentService');
const bookingService = {
  initiateBooking: async (bookingData) => {
    const { userId, tripId, selectedSeats, totalAmount, customerEmail, customerPhone } = bookingData;

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
    const seatRecords = await Seat.findAll({
      where: { 
        tripId: tripId, 
        seatNumber: selectedSeats,
        isBooked: 0 // Only consider available seats
      }
    });

    // Check if all selected seats exist and are available
    if (seatRecords.length !== selectedSeats.length) {
      const foundSeatNumbers = seatRecords.map(s => s.seatNumber);
      const missingSeats = selectedSeats.filter(seat => !foundSeatNumbers.includes(seat));
      throw new BadRequest(`Some selected seats are not available: ${missingSeats.join(', ')}`);
    }

    // Check if any seats are already booked (shouldn't happen with the query above, but good to double-check)
    const bookedSeats = seatRecords.filter(seat => seat.isBooked === 1);
    if (bookedSeats.length > 0) {
      throw new BadRequest(`Seats ${bookedSeats.map(s => s.seatNumber).join(', ')} are already booked`);
    }

    // Calculate total amount (should match provided totalAmount)
    const calculatedTotal = seatRecords.reduce((sum, seat) => sum + parseFloat(seat.price), 0);
    if (Math.abs(calculatedTotal - totalAmount) > 0.01) {
      throw new BadRequest('Total amount does not match seat prices');
    }

    // Use transaction for atomicity
    const t = await sequelize.transaction();
    let booking;

    try {
      // Create booking with initiated status
      booking = await Booking.create({
        userId,
        tripId,
        seats: selectedSeats,
        totalAmount,
        paymentStatus: 'pending',
        bookingStatus: 'initiated',
      }, { transaction: t });

      // Create BookedSeat records (temporarily locked)
      const bookedSeatsData = seatRecords.map(seat => ({
        bookingId: booking.id,
        tripId,
        seatNumber: seat.seatNumber,
        seatPrice: seat.price,
        isCancelled: false,
      }));

      await BookedSeat.bulkCreate(bookedSeatsData, { transaction: t });

      // Mark seats as booked in Seats table
      await Seat.update(
        { isBooked: 1 },
        { 
          where: { 
            tripId: tripId, 
            seatNumber: selectedSeats 
          }, 
          transaction: t 
        }
      );

      // Generate payment order
      const paymentResult = await paymentService.createOrder({
        orderAmount: totalAmount,
        customerEmail,
        customerPhone,
        customer_id: userId,
        bookingId: booking.id,
      });

      // Update booking with payment details
      await booking.update({
        paymentOrderId: paymentResult.order_id,
        paymentSessionId: paymentResult.payment_session_id,
        paymentExpiry: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes expiry
      }, { transaction: t });

      await t.commit();

      return {
        ...booking.get({ plain: true }),
        paymentSessionId: paymentResult.payment_session_id
      };
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
            {
              model: PickupPoint,
              as: 'pickupPoint',
              attributes: ['name'],
            },
            {
              model: DropPoint,
              as: 'dropPoint',
              attributes: ['name'],
            },
          ],
        },
      ],
      attributes: ['id', 'seats', 'totalAmount', 'paymentStatus', 'bookingStatus', 'createdAt'],
    });

    return bookings;
  },

  getBookingList: async () => {
    const bookings = await Booking.findAll({
      include: [
        {
          model: User,
          attributes: ['firstName', 'lastName'],
        },
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
            {
              model: PickupPoint,
              as: 'pickupPointsData',
              attributes: ['id', 'name'],
              through: { attributes: [] } // Exclude the join table attributes
            },
            {
              model: DropPoint,
              as: 'dropPointsData',
              attributes: ['id', 'name'],
              through: { attributes: [] } // Exclude the join table attributes
            }
            // Remove PickupPoint and DropPoint from here as they're not directly associated with Trip
          ],
        },
      ],
      attributes: ['id', 'seats', 'totalAmount', 'bookingStatus', 'createdAt', 'pickupPointId', 'dropPointId'],
    });

    // Get unique pickup and drop point IDs
    const pickupPointIds = [...new Set(bookings.map(b => b.pickupPointId).filter(Boolean))];
    const dropPointIds = [...new Set(bookings.map(b => b.dropPointId).filter(Boolean))];

    // Fetch pickup and drop points
    const [pickupPoints, dropPoints] = await Promise.all([
      PickupPoint.findAll({
        where: { id: { [Op.in]: pickupPointIds } },
        attributes: ['id', 'name']
      }),
      DropPoint.findAll({
        where: { id: { [Op.in]: dropPointIds } },
        attributes: ['id', 'name']
      })
    ]);

    // Create lookup maps
    const pickupPointMap = new Map(pickupPoints.map(pp => [pp.id, pp]));
    const dropPointMap = new Map(dropPoints.map(dp => [dp.id, dp]));

    // Format the bookings data
    const formattedBookings = bookings.map(booking => {
      const pickupPoint = booking.pickupPointId ? pickupPointMap.get(booking.pickupPointId) : null;
      const dropPoint = booking.dropPointId ? dropPointMap.get(booking.dropPointId) : null;
      
      return {
        BookingID: booking.id,
        User: booking.User ? `${booking.User.firstName} ${booking.User.lastName}`.trim() : 'Unknown',
        Trip: booking.Trip ? 
          `${booking.Trip.startLocation?.name || 'Unknown'} → ${booking.Trip.endLocation?.name || 'Unknown'}` : 
          'Unknown Route',
        Pickup: pickupPoint?.name || 'Not specified',
        Drop: dropPoint?.name || 'Not specified',
        Seats: booking.seats,
        Status: booking.bookingStatus,
        Amount: `₹${booking.totalAmount}`,
        Car: booking.Trip?.Car ? `${booking.Trip.Car.carType} (${booking.Trip.Car.carName})` : 'N/A',
        Date: booking.createdAt
      };
    });

    return formattedBookings;
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
