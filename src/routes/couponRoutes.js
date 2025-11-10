const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { 
  createCouponValidation, 
  updateCouponValidation, 
  getCouponsValidation, 
  validateCouponValidation,
  couponExists,
  isCouponValid
} = require('../middleware/validators/couponValidator');


// @desc    Create a new coupon
// @route   POST /api/v1/coupons
// @access  Private/Admin
router.post('/', createCouponValidation, couponController.createCoupon);

// @desc    Update a coupon
// @route   PUT /api/v1/coupons/:id
// @access  Private/Admin
router.put('/:id', updateCouponValidation, couponExists, couponController.updateCoupon);

// @desc    Delete a coupon
// @route   DELETE /api/v1/coupons/:id
// @access  Private/Admin
router.delete('/:id', couponExists, couponController.deleteCoupon);

// @desc    Get all coupons (with pagination)
// @route   GET /api/v1/coupons
// @access  Private/Admin
router.get('/', getCouponsValidation, couponController.getCoupons);

// @desc    Get active coupons
// @route   GET /api/v1/coupons/active
// @access  Public
router.get('/active', couponController.getActiveCoupons);

// @desc    Get coupon by ID
// @route   GET /api/v1/coupons/:id
// @access  Private/Admin
router.get('/:id', couponExists, couponController.getCouponById);

// Public routes (no authentication required for these endpoints)

// @desc    Validate coupon code
// @route   POST /api/v1/coupons/validate
// @access  Public
router.post('/validate', validateCouponValidation, isCouponValid, couponController.validateCoupon);

module.exports = router;
