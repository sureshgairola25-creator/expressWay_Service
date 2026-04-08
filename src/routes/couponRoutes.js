const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { protect, authorize } = require('../../middleware/auth');
const {
  createCouponValidation,
  updateCouponValidation,
  getCouponsValidation,
  validateCouponValidation,
  couponExists,
  isCouponValid,
} = require('../middleware/validators/couponValidator');

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/active', couponController.getActiveCoupons);
router.post('/validate', validateCouponValidation, isCouponValid, couponController.validateCoupon);

// ── Admin-only ────────────────────────────────────────────────────────────────
router.post('/',    protect, authorize('admin'), createCouponValidation, couponController.createCoupon);
router.get('/',     protect, authorize('admin'), getCouponsValidation,   couponController.getCoupons);
router.get('/:id',  protect, authorize('admin'), couponExists,           couponController.getCouponById);
router.put('/:id',  protect, authorize('admin'), updateCouponValidation, couponExists, couponController.updateCoupon);
router.delete('/:id', protect, authorize('admin'), couponExists,         couponController.deleteCoupon);

module.exports = router;
