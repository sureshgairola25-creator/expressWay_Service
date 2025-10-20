const locationService = require('../services/locationService');
const asyncHandler = require('../../middleware/async');

const locationController = {
  // --- Admin Controllers ---

  createStartLocation: asyncHandler(async (req, res) => {
    const startLocation = await locationService.createStartLocation(req.body);
    res.status(201).json({ success: true, data: startLocation });
  }),

  createPickupPoint: asyncHandler(async (req, res) => {
    const pickupPoint = await locationService.createPickupPoint(req.body);
    res.status(201).json({ success: true, data: pickupPoint });
  }),

  createEndLocation: asyncHandler(async (req, res) => {
    const endLocation = await locationService.createEndLocation(req.body);
    res.status(201).json({ success: true, data: endLocation });
  }),

  createDropPoint: asyncHandler(async (req, res) => {
    const dropPoint = await locationService.createDropPoint(req.body);
    res.status(201).json({ success: true, data: dropPoint });
  }),

  createRoute: asyncHandler(async (req, res) => {
    const route = await locationService.createRoute(req.body);
    res.status(201).json({ success: true, data: route });
  }),

  getAllRoutes: asyncHandler(async (req, res) => {
    const routes = await locationService.getAllRoutes();
    res.status(200).json({ success: true, data: routes });
  }),

  updateRoute: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await locationService.updateRoute(id,req.body);
    res.status(200).json({ success: true, data: result });
  }),

  deleteRoute: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await locationService.deleteRoute(id);
    res.status(200).json({ success: true, data: result });
  }),

  updateStartLocation: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await locationService.updateStartLocation(id,req.body);
    res.status(200).json({ success: true, data: result });
  }),

  updatePickupPoint: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await locationService.updatePickupPoint(id,req.body);
    res.status(200).json({ success: true, data: result });
  }),

  updateEndLocation: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await locationService.updateEndLocation(id,req.body);
    res.status(200).json({ success: true, data: result });
  }),

  updateDropPoint: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await locationService.updateDropPoint(id,req.body);
    res.status(200).json({ success: true, data: result });
  }),

  deleteStartLocation: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await locationService.deleteStartLocation(id);
    res.status(200).json({ success: true, data: result });
  }),

  deletePickupPoint: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await locationService.deletePickupPoint(id);
    res.status(200).json({ success: true, data: result });
  }),

  deleteEndLocation: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await locationService.deleteEndLocation(id);
    res.status(200).json({ success: true, data: result });
  }),

  deleteDropPoint: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await locationService.deleteDropPoint(id);
    res.status(200).json({ success: true, data: result });
  }),

  getAllStartLocations: asyncHandler(async (req, res) => {
    const startLocations = await locationService.getAllStartLocations();
    res.status(200).json({ success: true, data: startLocations });
  }),

  getLocationInfo: asyncHandler(async (req, res) => {
    const { startLocation, endLocation, pickupPoint, dropPoint } = req.query;
    const locationInfo = await locationService.getLocationInfo({
      startLocationId: startLocation,
      endLocationId: endLocation,
      pickupPointId: pickupPoint,
      dropPointId: dropPoint,
    });
    res.status(200).json({
      success: true,
      data: locationInfo,
    });
  }),

  getAllEndLocations: asyncHandler(async (req, res) => {
    const endLocation = await locationService.getAllEndLocations();
    res.status(200).json({ success: true, data: endLocation });
  }),

  getPickupPoints: asyncHandler(async (req, res) => {
    const { startLocationId } = req.params;
    const pickupPoints = await locationService.getPickupPointsByStartLocation(startLocationId);
    res.status(200).json({ success: true, data: pickupPoints });
  }),

  getEndLocations: asyncHandler(async (req, res) => {
    const { startLocationId } = req.params;
    const endLocations = await locationService.getEndLocationsByStartLocation(startLocationId);
    res.status(200).json({ success: true, data: endLocations });
  }),

  getDropPoints: asyncHandler(async (req, res) => {
    const { endLocationId } = req.params;
    const dropPoints = await locationService.getDropPointsByEndLocation(endLocationId);
    res.status(200).json({ success: true, data: dropPoints });
  }),
};

module.exports = locationController;
