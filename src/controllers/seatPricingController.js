const seatPricingService = require('../services/seatPricingService');
const asyncHandler = require('../../middleware/async');

const seatPricingController = {
  createSeatPricing: asyncHandler(async (req, res) => {
    const seats = await seatPricingService.createSeatPricing(req.body.seats, req.body.tripId);
    res.status(201).json({ success: true, data: seats });
  }),

  getSeatPricingByTrip: asyncHandler(async (req, res) => {
    const seats = await seatPricingService.getSeatPricingByTrip(req.params.tripId);
    res.status(200).json({ success: true, data: seats });
  }),

  updateSeatPricing: asyncHandler(async (req, res) => {
    const seat = await seatPricingService.updateSeatPricing(req.params.id, req.body);
    res.status(200).json({ success: true, data: seat });
  }),

  deleteSeatPricing: asyncHandler(async (req, res) => {
    const result = await seatPricingService.deleteSeatPricing(req.params.id);
    res.status(200).json({ success: true, data: result });
  }),
};

module.exports = seatPricingController;
