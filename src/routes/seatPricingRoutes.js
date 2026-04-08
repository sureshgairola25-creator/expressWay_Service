const express = require('express');
const router = express.Router();
const seatPricingController = require('../controllers/seatPricingController');
const { protect, authorize } = require('../../middleware/auth');

// ── Public — needed to display seat prices during booking ────────────────────
router.get('/:tripId', seatPricingController.getSeatPricingByTrip);

// ── Admin-only ────────────────────────────────────────────────────────────────
router.post('/',   protect, authorize('admin'), seatPricingController.createSeatPricing);
router.put('/:id', protect, authorize('admin'), seatPricingController.updateSeatPricing);
router.delete('/:id', protect, authorize('admin'), seatPricingController.deleteSeatPricing);

module.exports = router;
