const express = require('express');
const router = express.Router();
const tripController = require('../controllers/tripController');
const { protect, authorize } = require('../../middleware/auth');

// ── Public search routes ──────────────────────────────────────────────────────
router.get('/search',             tripController.searchTrips);
router.get('/calculate-price',    tripController.calculatePrice);
router.get('/search-personalize', tripController.searchPersonalizeTrips);
router.get('/departure-times',    tripController.getDepartureTimes);
router.get('/list',               tripController.getAllTrips);
router.get('/details/:id',        tripController.getTripById);
router.get('/:tripId/seats',      tripController.getTripSeats);

// ── Admin-only trip management ────────────────────────────────────────────────
router.post('/create',                      protect, authorize('admin'), tripController.createTrip);
router.put('/update/:id',                   protect, authorize('admin'), tripController.updateTrip);
router.delete('/delete/:id',                protect, authorize('admin'), tripController.deleteTrip);
router.put('/update-group/:tripGroupId',    protect, authorize('admin'), tripController.updateTripGroup);
router.delete('/delete-group/:tripGroupId', protect, authorize('admin'), tripController.deleteTripGroup);

module.exports = router;
