const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');
const { protect, authorize } = require('../../middleware/auth');

// ── Public — used by booking search flow ─────────────────────────────────────
router.get('/start',                          locationController.getAllStartLocations);
router.get('/end',                            locationController.getAllEndLocations);
router.get('/start/:startLocationId/pickup',  locationController.getPickupPoints);
router.get('/start/:startLocationId/end',     locationController.getEndLocations);
router.get('/start/:id/end',                  locationController.getEndLocationsByStartLocation);
router.get('/end/:endLocationId/drop',        locationController.getDropPoints);
router.get('/info',                           locationController.getLocationInfo);
router.get('/routes',                         locationController.getAllRoutes);

// Personalize-specific (public — used on personalize search page)
router.get('/personalize/start', locationController.getPersonalizeStartLocations);
router.get('/personalize/end',   locationController.getPersonalizeEndLocations);

// ── Admin-only ────────────────────────────────────────────────────────────────
router.post('/start',         protect, authorize('admin'), locationController.createStartLocation);
router.put('/start/:id',      protect, authorize('admin'), locationController.updateStartLocation);
router.delete('/start/:id',   protect, authorize('admin'), locationController.deleteStartLocation);

router.post('/end',           protect, authorize('admin'), locationController.createEndLocation);
router.put('/end/:id',        protect, authorize('admin'), locationController.updateEndLocation);
router.delete('/end/:id',     protect, authorize('admin'), locationController.deleteEndLocation);

router.post('/pickup',        protect, authorize('admin'), locationController.createPickupPoint);
router.put('/pickup/:id',     protect, authorize('admin'), locationController.updatePickupPoint);
router.delete('/pickup/:id',  protect, authorize('admin'), locationController.deletePickupPoint);

router.post('/drop',          protect, authorize('admin'), locationController.createDropPoint);
router.put('/drop-points/:id', protect, authorize('admin'), locationController.updateDropPoint);
router.delete('/drop/:id',    protect, authorize('admin'), locationController.deleteDropPoint);

router.post('/route',         protect, authorize('admin'), locationController.createRoute);
router.put('/route/:id',      protect, authorize('admin'), locationController.updateRoute);
router.delete('/route/:id',   protect, authorize('admin'), locationController.deleteRoute);

module.exports = router;
