const { body, param, query } = require('express-validator');
const { Op, sequelize } = require('sequelize');
const Coupon = require('../../db/models/coupon');

// Common validation rules
const codeValidation = body('code')
  .trim()
  .notEmpty().withMessage('Coupon code is required')
  .isLength({ min: 4, max: 20 }).withMessage('Coupon code must be between 4 and 20 characters')
  .matches(/^[A-Z0-9-]+$/).withMessage('Coupon code can only contain uppercase letters, numbers, and hyphens');

const discountTypeValidation = body('discountType')
  .isIn(['PERCENTAGE', 'FLAT']).withMessage('Invalid discount type');

const discountValueValidation = body('discountValue')
  .isFloat({ gt: 0 }).withMessage('Discount value must be greater than 0');

const minOrderAmountValidation = body('minOrderAmount')
  .optional({ checkFalsy: true })
  .isFloat({ min: 0 }).withMessage('Minimum order amount must be 0 or greater');

const maxDiscountAmountValidation = body('maxDiscountAmount')
  .optional({ checkFalsy: true })
  .isFloat({ gt: 0 }).withMessage('Maximum discount amount must be greater than 0')
  .custom((value, { req }) => {
    if (req.body.discountType === 'PERCENTAGE' && !value) {
      throw new Error('Maximum discount amount is required for percentage discount');
    }
    return true;
  });

const startDateValidation = body('startDate')
  .notEmpty().withMessage('Start date is required')
  .isISO8601().withMessage('Invalid start date format')
  .custom((value, { req }) => {
    if (new Date(value) < new Date()) {
      throw new Error('Start date cannot be in the past');
    }
    return true;
  });

const endDateValidation = body('endDate')
  .notEmpty().withMessage('End date is required')
  .isISO8601().withMessage('Invalid end date format')
  .custom((value, { req }) => {
    if (new Date(value) <= new Date(req.body.startDate)) {
      throw new Error('End date must be after start date');
    }
    return true;
  });

const statusValidation = body('status')
  .optional()
  .isBoolean().withMessage('Status must be a boolean value');

const usageLimitPerUserValidation = body('usageLimitPerUser')
  .optional({ checkFalsy: true })
  .isInt({ min: 1 }).withMessage('Usage limit per user must be at least 1');

const totalUsageLimitValidation = body('totalUsageLimit')
  .optional({ checkFalsy: true })
  .isInt({ min: 1 }).withMessage('Total usage limit must be at least 1');

// Middleware for creating a coupon
exports.createCouponValidation = [
  codeValidation,
  discountTypeValidation,
  discountValueValidation,
  minOrderAmountValidation,
  maxDiscountAmountValidation,
  startDateValidation,
  endDateValidation,
  statusValidation,
  usageLimitPerUserValidation,
  totalUsageLimitValidation,
  body('description')
    .optional()
    .isString().withMessage('Description must be a string')
    .isLength({ max: 1000 }).withMessage('Description cannot exceed 1000 characters'),
  body('image')
    .optional()
    .custom((value, { req }) => {
      if (req.file) {
        const filetypes = /jpeg|jpg|png|webp|gif/;
        const extname = filetypes.test(path.extname(req.file.originalname).toLowerCase());
        const mimetype = filetypes.test(req.file.mimetype);
        
        if (!extname || !mimetype) {
          throw new Error('Only image files are allowed (jpeg, jpg, png, webp, gif)');
        }
        
        // 5MB limit
        const maxSize = 5 * 1024 * 1024;
        if (req.file.size > maxSize) {
          throw new Error('Image size must be less than 5MB');
        }
      }
      return true;
    })
];

// Middleware for updating a coupon
exports.updateCouponValidation = [
  param('id')
    .isInt().withMessage('Invalid coupon ID')
    .toInt(),
  codeValidation.optional(),
  discountTypeValidation.optional(),
  discountValueValidation.optional(),
  minOrderAmountValidation,
  maxDiscountAmountValidation,
  startDateValidation.optional(),
  endDateValidation.optional(),
  statusValidation,
  usageLimitPerUserValidation,
  totalUsageLimitValidation,
  body('description')
    .optional()
    .isString().withMessage('Description must be a string')
    .isLength({ max: 1000 }).withMessage('Description cannot exceed 1000 characters'),
  body('image')
    .optional()
    .custom((value, { req }) => {
      if (req.file) {
        const filetypes = /jpeg|jpg|png|webp|gif/;
        const extname = filetypes.test(path.extname(req.file.originalname).toLowerCase());
        const mimetype = filetypes.test(req.file.mimetype);
        
        if (!extname || !mimetype) {
          throw new Error('Only image files are allowed (jpeg, jpg, png, webp, gif)');
        }
        
        // 5MB limit
        const maxSize = 5 * 1024 * 1024;
        if (req.file.size > maxSize) {
          throw new Error('Image size must be less than 5MB');
        }
      }
      return true;
    })
];

// Middleware for getting coupons with pagination
exports.getCouponsValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('status')
    .optional()
    .isIn(['true', 'false']).withMessage('Status must be true or false'),
  query('search')
    .optional()
    .isString().withMessage('Search term must be a string')
    .isLength({ max: 100 }).withMessage('Search term cannot exceed 100 characters')
];

// Middleware for validating coupon code
exports.validateCouponValidation = [
  body('code')
    .trim()
    .notEmpty().withMessage('Coupon code is required'),
  body('amount')
    .isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('userId')
    .optional()
    .isInt({ min: 1 }).withMessage('Invalid user ID')
];

// Middleware for checking if coupon exists
exports.couponExists = [
  param('id')
    .isInt().withMessage('Invalid coupon ID')
    .toInt()
    .custom(async (value) => {
      const coupon = await Coupon.findByPk(value);
      if (!coupon) {
        throw new Error('Coupon not found');
      }
      return true;
    })
];

// Middleware for checking if coupon code is unique
exports.isCodeUnique = [
  body('code')
    .custom(async (value) => {
      const coupon = await Coupon.findOne({ where: { code: value.toUpperCase() } });
      if (coupon) {
        throw new Error('Coupon code already exists');
      }
      return true;
    })
];

// Middleware for checking if coupon is active and valid
exports.isCouponValid = [
  body('code')
    .trim()
    .notEmpty().withMessage('Coupon code is required')
    .custom(async (value, { req }) => {
      const now = new Date();
      const coupon = await Coupon.findOne({
        where: {
          code: value.toUpperCase(),
          status: true,
          startDate: { [Op.lte]: now },
          endDate: { [Op.gte]: now },
          [Op.or]: [
            { totalUsageLimit: null },
            { 
              totalUsageLimit: { [Op.gt]: 0 },
              [Op.and]: [
                sequelize.literal('"totalUsageLimit" > "totalUsed"')
              ]
            }
          ]
        }
      });

      if (!coupon) {
        throw new Error('Invalid or expired coupon code');
      }

      // Attach coupon to request for later use
      req.coupon = coupon;
      return true;
    })
];
