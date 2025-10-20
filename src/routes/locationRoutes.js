const express = require('express');
const locationController = require('../controllers/locationController');

const router = express.Router();

// Get location info by ids
router.get('/info', locationController.getLocationInfo);

// Get all start locations
router.get('/start', locationController.getAllStartLocations);

// Get pickup points for a start location
router.get('/:startLocationId/pickup', locationController.getPickupPoints);

// Get end locations for a start location
router.get('/:startLocationId/end', locationController.getEndLocations);

// Get drop points for an end location
router.get('/:endLocationId/drop', locationController.getDropPoints);

// Get hierarchical locations
// router.get('/', locationController.getHierarchicalLocations);

module.exports = router;
