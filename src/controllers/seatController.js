const seatService = require('../services/seatService');
const asyncHandler = require('../../middleware/async');

const seatController = {
  getSeatsForTrip: asyncHandler(async (req, res) => {
    const { tripId } = req.params;
    const seats = await seatService.getSeatsForTrip(tripId);
    res.status(200).json({ success: true, data: seats });
  }),

  updateSeatPricing: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const seat = await seatService.updateSeatPricing(id, req.body);
    res.status(200).json({ success: true, data: seat });
  }),
};

module.exports = seatController;
