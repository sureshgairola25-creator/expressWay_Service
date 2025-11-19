const db = require('../db/models');
const { Booking, BookedSeat, Trip, Seat, User, Car, StartLocation, EndLocation, PickupPoint, DropPoint } = db;

// Ensure models are properly associated
const { sequelize } = require('../db/database');
const { Op } = require('sequelize');
const { NotFound, BadRequest } = require('http-errors');
const paymentService = require('./paymentService');
const bookingService = {
  //   const { userId, tripId, pickupPointId, dropPointId, selectedSeats, totalAmount, customerEmail, customerPhone } = bookingData;

  //   // Validate user exists
  //   const user = await User.findByPk(userId);
  //   if (!user) {
  //     throw new BadRequest('User not found');
  //   }

  //   // Validate trip exists and is active
  //   const trip = await Trip.findByPk(tripId);
  //   if (!trip) {
  //     throw new BadRequest('Trip not found');
  //   }
  //   if (trip.status !== true) {
  //     throw new BadRequest('Trip is not active');
  //   }

  //   // Validate selected seats exist and are available
  //   const seatRecords = await Seat.findAll({
  //     where: { 
  //       tripId: tripId, 
  //       seatNumber: selectedSeats,
  //       isBooked: 0 // Only consider available seats
  //     }
  //   });

  //   // Check if all selected seats exist and are available
  //   if (seatRecords.length !== selectedSeats.length) {
  //     const foundSeatNumbers = seatRecords.map(s => s.seatNumber);
  //     const missingSeats = selectedSeats.filter(seat => !foundSeatNumbers.includes(seat));
  //     throw new BadRequest(`Some selected seats are not available: ${missingSeats.join(', ')}`);
  //   }

  //   // Check if any seats are already booked (shouldn't happen with the query above, but good to double-check)
  //   const bookedSeats = seatRecords.filter(seat => seat.isBooked === 1);
  //   if (bookedSeats.length > 0) {
  //     throw new BadRequest(`Seats ${bookedSeats.map(s => s.seatNumber).join(', ')} are already booked`);
  //   }

  //   // Calculate total amount (should match provided totalAmount)
  //   const calculatedTotal = seatRecords.reduce((sum, seat) => sum + parseFloat(seat.price), 0);
  //   if (Math.abs(calculatedTotal - totalAmount) > 0.01) {
  //     throw new BadRequest('Total amount does not match seat prices');
  //   }

  //   // Use transaction for atomicity
  //   const t = await sequelize.transaction();
  //   let booking;

  //   try {
  //     // Create booking with initiated status
  //     booking = await Booking.create({
  //       userId,
  //       tripId,
  //       pickupPointId,
  //       dropPointId,
  //       seats: selectedSeats,
  //       totalAmount,
  //       paymentStatus: 'pending',
  //       bookingStatus: 'initiated',
  //     }, { transaction: t });

  //     // Create BookedSeat records (temporarily locked)
  //     const bookedSeatsData = seatRecords.map(seat => ({
  //       bookingId: booking.id,
  //       tripId,
  //       seatNumber: seat.seatNumber,
  //       seatPrice: seat.price,
  //       isCancelled: false,
  //     }));

  //     await BookedSeat.bulkCreate(bookedSeatsData, { transaction: t });

  //     // Mark seats as booked in Seats table
  //     await Seat.update(
  //       { isBooked: 1 },
  //       { 
  //         where: { 
  //           tripId: tripId, 
  //           seatNumber: selectedSeats 
  //         }, 
  //         transaction: t 
  //       }
  //     );

  //     // Generate payment order
  //     const paymentResult = await paymentService.createOrder({
  //       orderAmount: totalAmount,
  //       customerEmail,
  //       customerPhone,
  //       customer_id: userId,
  //       bookingId: booking.id,
  //     });

  //     // Update booking with payment details
  //     await booking.update({
  //       paymentOrderId: paymentResult.order_id,
  //       paymentSessionId: paymentResult.payment_session_id,
  //       paymentExpiry: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes expiry
  //     }, { transaction: t });

  //     await t.commit();

  //     return {
  //       ...booking.get({ plain: true }),
  //       paymentSessionId: paymentResult.payment_session_id
  //     };
  //   } catch (error) {
  //     await t.rollback();
  //     throw error;
  //   }
  // },
  initiateBooking: async (bookingData) => {
    const {
      userId,
      tripId,
      pickupPointId,
      dropPointId,
      selectedSeats,
      totalAmount, // This is now the subtotal (before discount)
      customerEmail,
      customerPhone,
      selectedMeal,
      addons, // optional array of extras [{type, price}, ...]
      discountAmount = 0, // New: discount amount from coupon
      couponCode = null,  // New: coupon code if applied
      finalPayableAmount, // New: total after discount
    } = bookingData;
  
    // Validate user exists
    const user = await User.findByPk(userId);
    if (!user) throw new BadRequest("User not found");
  
    // Validate trip exists and is active
    const trip = await Trip.findByPk(tripId);
    if (!trip) throw new BadRequest("Trip not found");
    if (trip.status !== true) throw new BadRequest("Trip is not active");
  
    // Validate selected seats exist and are available
    const seatRecords = await Seat.findAll({
      where: {
        tripId,
        seatNumber: selectedSeats,
        isBooked: 0, // Only available seats
      },
    });
  
    // Check if all selected seats are valid
    if (seatRecords.length !== selectedSeats.length) {
      const foundSeats = seatRecords.map((s) => s.seatNumber);
      const missingSeats = selectedSeats.filter(
        (s) => !foundSeats.includes(s)
      );
      throw new BadRequest(
        `Some selected seats are not available: ${missingSeats.join(", ")}`
      );
    }
  
    // Double-check no seat is already booked (safety)
    const alreadyBooked = seatRecords.filter((s) => s.isBooked === 1);
    if (alreadyBooked.length > 0) {
      throw new BadRequest(
        `Seats ${alreadyBooked.map((s) => s.seatNumber).join(", ")} are already booked`
      );
    }
  
    // --- 💰 PRICE CALCULATION (Modular & Scalable) ---
    const seatTotal = seatRecords.reduce(
      (sum, seat) => sum + parseFloat(seat.price || 0),
      0
    );
  
    let extrasTotal = 0;
    const breakdown = {
      seatTotal,
      extras: [],
      subtotal: 0, // Will be set after calculating extras
      coupon: null
    };
  
    // Include meal (if exists)
    if (selectedMeal?.price) {
      const mealPrice = parseFloat(selectedMeal.price);
      extrasTotal += mealPrice;
      breakdown.extras.push({
        type: selectedMeal.type || "Meal",
        price: mealPrice,
      });
    }
  
    // Include addons (if any)
    if (Array.isArray(addons) && addons.length > 0) {
      addons.forEach((addon) => {
        const addonPrice = parseFloat(addon.price || 0);
        extrasTotal += addonPrice;
        breakdown.extras.push({
          type: addon.type || "Addon",
          price: addonPrice,
        });
      });
    }
  
    const calculatedSubtotal = seatTotal + extrasTotal;
    breakdown.subtotal = calculatedSubtotal;
    
    // Add coupon details to breakdown if coupon is applied
    if (couponCode) {
      breakdown.coupon = {
        code: couponCode,
        discount: parseFloat(discountAmount) || 0,
        finalAmount: parseFloat(finalPayableAmount) || calculatedSubtotal
      };
    }
  
    // Validate subtotal amount (before discount)
    if (Math.abs(calculatedSubtotal - totalAmount) > 0.01) {
      throw new BadRequest(
        `Subtotal amount mismatch. Expected ${calculatedSubtotal}, received ${totalAmount}`
      );
    }
    
    // Validate final payable amount (after discount)
    const expectedFinal = calculatedSubtotal - (parseFloat(discountAmount) || 0);
    if (Math.abs(expectedFinal - parseFloat(finalPayableAmount)) > 0.01) {
      throw new BadRequest(
        `Final payable amount mismatch. Expected ${expectedFinal}, received ${finalPayableAmount}`
      );
    }
  
    // --- TRANSACTION FOR ATOMICITY ---
    const t = await sequelize.transaction();
    let booking;
  
    try {
      // Create booking with initiated status
      booking = await Booking.create(
        {
          userId,
          tripId,
          pickupPointId,
          dropPointId,
          seats: selectedSeats,
          subtotalAmount: totalAmount, // Store subtotal (before discount)
          discountAmount: parseFloat(discountAmount) || 0,
          couponCode: couponCode,
          totalAmount: parseFloat(finalPayableAmount), // Store final payable amount
          paymentStatus: "pending",
          bookingStatus: "initiated",
          priceBreakdown: breakdown, // 💾 Store detailed breakdown
          selectedMeal: selectedMeal
        },
        { transaction: t }
      );
  
      // Create BookedSeat records
      const bookedSeatsData = seatRecords.map((seat) => ({
        bookingId: booking.id,
        tripId,
        seatNumber: seat.seatNumber,
        seatPrice: seat.price,
        isCancelled: false,
      }));
  
      await BookedSeat.bulkCreate(bookedSeatsData, { transaction: t });
  
      // Mark seats as booked
      await Seat.update(
        { isBooked: 1 },
        {
          where: {
            tripId,
            seatNumber: selectedSeats,
          }
        },
        { transaction: t }
      );

      // Create payment order with the final payable amount (after discount)
      const paymentResult = await paymentService.createOrder({
        orderId: `ORDER_${booking.id}_${Date.now()}`,
        orderAmount: parseFloat(finalPayableAmount), // Use final amount after discount
        customerEmail,
        customerPhone,
        customerId: userId,
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
        paymentSessionId: paymentResult.payment_session_id,
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
  
  getUserBookings: async (userId) => {
    try {
      // Validate userId
      if (!userId || isNaN(parseInt(userId))) {
        throw new Error('Invalid user ID');
      }
      
      // Import models directly to avoid circular dependencies
      const Booking = require('../db/models/Booking');
      const Trip = require('../db/models/Trip');
      const Car = require('../db/models/Car');
      const StartLocation = require('../db/models/StartLocation');
      const EndLocation = require('../db/models/EndLocation');
      
      const bookings = await Booking.findAll({
        where: { userId: parseInt(userId) },
        include: [
          {
            model: Trip,
            as: 'trip',
            include: [
              {
                model: Car,
                as: 'Car',
                attributes: ['id', 'carName', 'carType', 'registrationNumber']
              },
              {
                model: StartLocation,
                as: 'startLocation',
                attributes: ['id', 'name']
              },
              {
                model: EndLocation,
                as: 'endLocation',
                attributes: ['id', 'name']
              }
            ]
          }
        ],
        attributes: ['id', 'seats', 'totalAmount', 'paymentStatus', 'bookingStatus'],
      });

      return bookings || [];
    } catch (error) {
      console.error('Error in getUserBookings:', error);
      throw error;
    }
  },

  getBookingDetails: async (bookingId) => {
    const booking = await Booking.findOne({
      where: { id: bookingId },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone']
        },
        {
          model: Trip,
          as: 'trip',
          include: [
            {
              model: Car,
              as: 'car',
              attributes: ['id', 'name', 'type', 'registrationNumber', 'totalSeats']
            },
            {
              model: StartLocation,
              as: 'startLocation',
              attributes: ['id', 'name']
            },
            {
              model: EndLocation,
              as: 'endLocation',
              attributes: ['id', 'name']
            }
          ]
        },
        {
          model: PickupPoint,
          as: 'pickupPoint',
          attributes: ['id', 'name']
        },
        {
          model: DropPoint,
          as: 'dropPoint',
          attributes: ['id', 'name']
        }
      ],
      attributes: [
        'id', 
        'seats', 
        'totalAmount', 
        'bookingStatus', 
        'paymentStatus',
        'createdAt', 
        'pickupPointId', 
        'dropPointId',
        'tripId',
        'userId',
        'selectedMeal',
        'priceBreakdown'
      ]
    });

    if (!booking) {
      throw new NotFound('Booking not found');
    }

    // Format the response
    return {
      id: booking.id,
      user: booking.User ? {
        id: booking.User.id,
        name: `${booking.User.firstName || ''} ${booking.User.lastName || ''}`.trim() || 'Unknown',
        email: booking.User.email,
        phone: booking.User.phone
      } : { id: null, name: 'Unknown' },
      trip: booking.trip ? {
        id: booking.trip.id,
        route: booking.trip.startLocation && booking.trip.endLocation 
          ? `${booking.trip.startLocation.name} → ${booking.trip.endLocation.name}`
          : 'Unknown Route',
        startLocation: booking.trip.startLocation,
        endLocation: booking.trip.endLocation,
        startTime: booking.trip.startTime,
        endTime: booking.trip.endTime,
        duration: booking.trip.duration,
        car: booking.trip.car ? {
          id: booking.trip.car.id,
          name: booking.trip.car.name,
          type: booking.trip.car.type,
          registrationNumber: booking.trip.car.registrationNumber,
          totalSeats: booking.trip.car.totalSeats
        } : null
      } : null,
      pickupPoint: booking.pickupPoint || null,
      dropPoint: booking.dropPoint || null,
      seats: booking.seats,
    };
  },

  getBookingList: async (userId = null) => {
    try {
      // Import models directly from the models directory to avoid circular dependencies
      const Booking = require('../db/models/Booking');
      const User = require('../db/models/User');
      const Trip = require('../db/models/Trip');
      const Car = require('../db/models/Car');
      const StartLocation = require('../db/models/StartLocation');
      const EndLocation = require('../db/models/EndLocation');
      const PickupPoint = require('../db/models/PickupPoint');
      const DropPoint = require('../db/models/DropPoint');
      
      // If userId is provided, ensure it's a valid number
      if (userId !== null && (isNaN(parseInt(userId)) || parseInt(userId) <= 0)) {
        throw new Error('Invalid user ID');
      }
      
      // Ensure models are properly associated
      const db = require('../db/models');
      
      // Define the query options with explicit includes and aliases
      const options = {
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNo']
          },
          {
            model: Trip,
            as: 'trip',
            include: [
              {
                model: Car,
                as: 'Car',
                attributes: ['id', 'carName', 'carType', 'registrationNumber']
              },
              {
                model: StartLocation,
                as: 'startLocation',
                attributes: ['id', 'name']
              },
              {
                model: EndLocation,
                as: 'endLocation',
                attributes: ['id', 'name']
              }
            ]
          },
          {
            model: PickupPoint,
            as: 'pickupPoint',
            attributes: ['id', 'name']
          },
          {
            model: DropPoint,
            as: 'dropPoint',
            attributes: ['id', 'name']
          }
        ],
        order: [['created_at', 'DESC']]
      };
      
      if (userId) {
        options.where = { userId };
      }
      
      // Execute the query
      const bookings = await Booking.findAll(options);
      
      if (!bookings || bookings.length === 0) return [];
      
      // Format the response
      return bookings.map(booking => ({
        id: booking.id,
        user: booking.user ? {
          id: booking.user.id,
          firstName: booking.user.firstName,
          lastName: booking.user.lastName,
          email: booking.user.email,
          phone: booking.user.phone
        } : null,
        trip: booking.trip ? {
          id: booking.trip.id,
          car: booking.trip.car ? {
            id: booking.trip.car.id,
            name: booking.trip.car.name,
            type: booking.trip.car.type,
            registrationNumber: booking.trip.car.registrationNumber
          } : null,
          startLocation: booking.trip.startLocation ? {
            id: booking.trip.startLocation.id,
            name: booking.trip.startLocation.name
          } : null,
          endLocation: booking.trip.endLocation ? {
            id: booking.trip.endLocation.id,
            name: booking.trip.endLocation.name
          } : null
        } : null,
        pickupPoint: booking.pickupPoint ? {
          id: booking.pickupPoint.id,
          name: booking.pickupPoint.name
        } : null,
        dropPoint: booking.dropPoint ? {
          id: booking.dropPoint.id,
          name: booking.dropPoint.name
        } : null,
        seats: booking.seats,
        totalAmount: booking.totalAmount,
        bookingStatus: booking.bookingStatus,
        paymentStatus: booking.paymentStatus,
        selectedMeal: booking.selectedMeal,
        priceBreakdown: booking.priceBreakdown,
        createdAt: booking.createdAt
      }));
    } catch (error) {
      console.error('Error in getBookingList:', error);
      throw error;
    }
    
    try {
      const [bookings] = await sequelize.query(query, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
        nest: true
      });
      
      if (!bookings || bookings.length === 0) return [];
      
      // Format the results to match the expected structure
      return bookings.map(booking => ({
        id: booking.id,
        user: {
          id: booking['user.id'],
          firstName: booking['user.firstName'],
          lastName: booking['user.lastName'],
          email: booking['user.email'],
          phone: booking['user.phone']
        },
        trip: booking['trip.id'] ? {
          id: booking['trip.id'],
          car: booking['trip.car.id'] ? {
            id: booking['trip.car.id'],
            name: booking['trip.car.name'],
            type: booking['trip.car.type'],
            registrationNumber: booking['trip.car.registrationNumber']
          } : null,
          startLocation: booking['trip.startLocation.id'] ? {
            id: booking['trip.startLocation.id'],
            name: booking['trip.startLocation.name']
          } : null,
          endLocation: booking['trip.endLocation.id'] ? {
            id: booking['trip.endLocation.id'],
            name: booking['trip.endLocation.name']
          } : null
        } : null,
        pickupPoint: booking['pickupPoint.id'] ? {
          id: booking['pickupPoint.id'],
          name: booking['pickupPoint.name']
        } : null,
        dropPoint: booking['dropPoint.id'] ? {
          id: booking['dropPoint.id'],
          name: booking['dropPoint.name']
        } : null,
        seats: booking.seats,
        totalAmount: booking.totalAmount,
        bookingStatus: booking.bookingStatus,
        paymentStatus: booking.paymentStatus,
        selectedMeal: booking.selectedMeal,
        priceBreakdown: booking.priceBreakdown,
        createdAt: booking.createdAt
      }));
    } catch (error) {
      console.error('Error fetching booking list:', error);
      throw error;
    }
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
      await Seat.update(
        { isAvailable: true },
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
