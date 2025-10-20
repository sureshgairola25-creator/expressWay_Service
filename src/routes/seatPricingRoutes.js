const express = require('express');
const seatPricingController = require('../controllers/seatPricingController');

const router = express.Router();

// Create seat pricing records for a trip
router.post('/', seatPricingController.createSeatPricing);

// Get all seat pricing records for a trip
router.get('/:tripId', seatPricingController.getSeatPricingByTrip);

// Update seat pricing
router.put('/:id', seatPricingController.updateSeatPricing);

// Delete seat pricing
router.delete('/:id', seatPricingController.deleteSeatPricing);

module.exports = router;
