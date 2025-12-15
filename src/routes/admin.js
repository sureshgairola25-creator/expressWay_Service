const express = require('express');

const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

// GET /admin/dashboard-stats
router.get('/dashboard-stats', protect, authorize('admin'), adminController.getDashboardStats);



module.exports = router;