const express = require('express');
const router = express.Router();
const seatController = require('../controllers/seatController');
const { protect, authorize } = require('../../middleware/auth');

// ── Public — seat availability shown during booking ───────────────────────────
router.get('/:tripId', seatController.getSeatsForTrip);

// ── Admin-only ────────────────────────────────────────────────────────────────
router.put('/:id', protect, authorize('admin'), seatController.updateSeatPricing);

module.exports = router;
