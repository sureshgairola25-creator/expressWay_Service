const express = require('express');
const locationController = require('../controllers/locationController');

const router = express.Router();

// --- User-Facing Routes ---

// // Get all start locations
// router.get('/start', locationController.getAllStartLocations);

// // Get all end locations
router.get('/end', locationController.getAllEndLocations);

// // Get pickup points for a start location
// router.get('/start/:startLocationId/pickup', locationController.getPickupPoints);

// // Get end locations for a start location
// router.get('/start/:startLocationId/end', locationController.getEndLocations);

// // Get drop points for an end location
// router.get('/end/:endLocationId/drop', locationController.getDropPoints);

// Get all start locations
router.get('/start', locationController.getAllStartLocations);

// Get pickup points for a start location
router.get('/start/:startLocationId/pickup', locationController.getPickupPoints);

// Get end locations for a start location
router.get('/start/:startLocationId/end', locationController.getEndLocations);

// Get drop points for an end location
router.get('/end/:endLocationId/drop', locationController.getDropPoints);

// --- Admin Routes ---

// Create a new start location
router.post('/start', locationController.createStartLocation);

// Create a new pickup point
router.post('/pickup', locationController.createPickupPoint);

// Create a new end location
router.post('/end', locationController.createEndLocation);

// Create a new drop point
router.post('/drop', locationController.createDropPoint);

//create a route 
router.post('/route', locationController.createRoute);

//get all routes
router.get('/routes', locationController.getAllRoutes);

//update a routes
router.put('/route/:id', locationController.updateRoute);

//delete a route
router.delete('/route/:id', locationController.deleteRoute);

// Update a start location
router.put('/start/:id', locationController.updateStartLocation);

// Update an end location
router.put('/end/:id', locationController.updateEndLocation);

// Update a pickup point
router.put('/pickup-points/:id', locationController.updatePickupPoint);

// Update a drop point
router.put('/drop-points/:id', locationController.updateDropPoint);


// Delete a start location
router.delete('/start/:id', locationController.deleteStartLocation);

// Delete a pickup point
router.delete('/pickup/:id', locationController.deletePickupPoint);

// Delete an end location
router.delete('/end/:id', locationController.deleteEndLocation);

// Delete a drop point
router.delete('/drop/:id', locationController.deleteDropPoint);

// Get location info by ids
router.get('/info', locationController.getLocationInfo);

module.exports = router;

