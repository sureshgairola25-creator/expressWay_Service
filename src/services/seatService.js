const { SeatPricing } = require('../db/models');
const { NotFound } = require('http-errors');

const seatService = {
  getSeatsForTrip: async (tripId) => {
    return SeatPricing.findAll({ where: { tripId } });
  },

  updateSeatPricing: async (id, data) => {
    const seat = await SeatPricing.findByPk(id);
    if (!seat) {
      throw new NotFound('Seat not found');
    }
    return seat.update(data);
  },
};

module.exports = seatService;
