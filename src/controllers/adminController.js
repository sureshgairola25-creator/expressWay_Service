const adminService = require('../services/adminService');
const asyncHandler = require('../../middleware/async');

const adminController = {
    getDashboardStats: asyncHandler(async (req, res) => {
      const stats = await adminService.fetchDashboardStats();
      res.status(200).json({ success: true, data: stats });
    }),
  };
  
module.exports = adminController;
  