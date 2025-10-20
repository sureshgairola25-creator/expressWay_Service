const { SeatPricing } = require('../db/models');
const { NotFound } = require('http-errors');

const seatPricingService = {
  createSeatPricing: async (seats, tripId) => {
    // Validate that tripId is provided
    if (!tripId) {
      throw new Error('tripId is required');
    }

    // Add tripId to each seat and create
    const seatsWithTripId = seats.map(seat => ({
      ...seat,
      tripId,
      isBooked: false, // Default to not booked
    }));

    return SeatPricing.bulkCreate(seatsWithTripId);
  },

  getSeatPricingByTrip: async (tripId) => {
    return SeatPricing.findAll({ where: { tripId } });
  },

  updateSeatPricing: async (id, data) => {
    const seat = await SeatPricing.findByPk(id);
    if (!seat) {
      throw new NotFound('Seat pricing not found');
    }
    return seat.update(data);
  },

  deleteSeatPricing: async (id) => {
    const seat = await SeatPricing.findByPk(id);
    if (!seat) {
      throw new NotFound('Seat pricing not found');
    }
    await seat.destroy();
    return { message: 'Seat pricing deleted successfully' };
  },
};

module.exports = seatPricingService;
