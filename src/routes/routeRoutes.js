const express = require('express');
const router = express.Router();
const { routeController } = require('../controllers/routeController');
const { protect, authorize } = require('../../middleware/auth');

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/',    routeController.getAllRoutes);
router.get('/:id', routeController.getRoute);

// ── Admin-only ────────────────────────────────────────────────────────────────
router.post('/create', protect, authorize('admin'), routeController.createRoute);
router.put('/:id',     protect, authorize('admin'), routeController.updateRoute);
router.delete('/:id',  protect, authorize('admin'), routeController.deleteRoute);

module.exports = router;
