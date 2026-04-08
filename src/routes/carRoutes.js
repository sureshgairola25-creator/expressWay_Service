const express = require('express');
const router = express.Router();
const carController = require('../controllers/carController');
const { uploadCarImage } = require('../utils/s3');
const { protect, authorize } = require('../../middleware/auth');

// ── Public — needed by booking flow and trip search ───────────────────────────
router.get('/list',       carController.getAllCars);
router.get('/details/:id', carController.getCarById);

// ── Admin-only ────────────────────────────────────────────────────────────────
router.post('/create',     protect, authorize('admin'), uploadCarImage, carController.createCar);
router.put('/update/:id',  protect, authorize('admin'), uploadCarImage, carController.updateCar);
router.delete('/delete/:id', protect, authorize('admin'), carController.deleteCar);

module.exports = router;
