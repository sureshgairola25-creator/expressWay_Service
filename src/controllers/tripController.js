const tripService = require('../services/tripService');
const asyncHandler = require('../../middleware/async');

const tripController = {
  createTrip: asyncHandler(async (req, res) => {
    const trip = await tripService.createTrip(req.body);
    res.status(201).json({ success: true, data: trip });
  }),

  getAllTrips: asyncHandler(async (req, res) => {
    const trips = await tripService.getAllTrips();
    res.status(200).json({ success: true, data: trips });
  }),

  getTripById: asyncHandler(async (req, res) => {
    const trip = await tripService.getTripById(req.params.id);
    res.status(200).json({ success: true, data: trip });
  }),

  updateTrip: asyncHandler(async (req, res) => {
    const trip = await tripService.updateTrip(req.params.id, req.body);
    res.status(200).json({ success: true, data: trip });
  }),

  deleteTrip: asyncHandler(async (req, res) => {
    const result = await tripService.deleteTrip(req.params.id);
    res.status(200).json({ success: true, data: result });
  }),

  searchTrips: asyncHandler(async (req, res) => {
    const trips = await tripService.searchTrips(req.query);
    res.status(200).json({ success: true, data: trips });
  }),

  getTripSeats: asyncHandler(async (req, res) => {
    const { tripId } = req.params;
    const seats = await tripService.getSeatsForTrip(tripId);
    res.status(200).json({ success: true, data: seats });
  }),
};

module.exports = tripController;
