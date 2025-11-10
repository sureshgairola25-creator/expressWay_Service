const express = require('express');
const { auth, adminOnly } = require('../lib/jwt');

const router = express.Router();
const adminController = require('../controllers/adminController');

// GET /admin/dashboard-stats
router.get('/dashboard-stats', adminController.getDashboardStats);



module.exports = router;