const express = require('express');
const seatController = require('../controllers/seatController');

const router = express.Router();

// Get all seats for a trip
router.get('/:tripId', seatController.getSeatsForTrip);

// Update seat price or booking status
router.put('/:id', seatController.updateSeatPricing);

module.exports = router;
