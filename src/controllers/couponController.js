const path = require('path');
const { Coupon, sequelize } = require('../db/models');
const { handleUpload, deleteFile } = require('../utils/fileUpload');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');

// ── Helper: extract relative path from absolute upload path ──────────────────
// Converts: /home/user/.../public/uploads/coupons/file.jpg
// To:       /uploads/coupons/file.jpg
const getRelativePath = (filePath) => {
  if (!filePath) return null;
  if (filePath.startsWith('/uploads/')) return filePath; // already relative
  const match = filePath.match(/\/uploads\/.*/);
  return match ? match[0] : filePath;
};

// ── Helper: safely delete file — never crashes on undefined ──────────────────
const safeDeleteFile = (filePath) => {
  if (!filePath) return;
  try {
    deleteFile(filePath);
  } catch (err) {
    console.error('Error deleting file:', err.message);
  }
};

// @desc    Create a new coupon
// @route   POST /coupons
// @access  Private/Admin
exports.createCoupon = [
  handleUpload,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        safeDeleteFile(req.file?.path);
        return res.status(400).json({ errors: errors.array() });
      }

      const requiredFields = ['code', 'discount_type', 'discount_value', 'start_date', 'end_date'];
      const missingFields  = requiredFields.filter(f => !req.body[f]);

      if (missingFields.length > 0) {
        safeDeleteFile(req.file?.path);
        return res.status(400).json({
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`,
        });
      }

      const {
        code,
        description          = null,
        discount_type:         discountType,
        discount_value:        discountValue,
        min_order_amount:      minOrderAmount     = null,
        max_discount_amount:   maxDiscountAmount  = null,
        start_date:            startDate,
        end_date:              endDate,
        status                 = true,
        usage_limit_per_user:  usageLimitPerUser  = null,
        total_usage_limit:     totalUsageLimit    = null,
      } = req.body;

      // ✅ Store relative path only
      const imageUrl = req.file ? getRelativePath(req.file.path) : null;

      // Duplicate code check
      const existingCoupon = await Coupon.findOne({ where: { code: code.toUpperCase() } });
      if (existingCoupon) {
        safeDeleteFile(req.file?.path);
        return res.status(400).json({ success: false, message: 'Coupon code already exists' });
      }

      // Percentage requires maxDiscountAmount
      if (discountType === 'PERCENTAGE' && !maxDiscountAmount) {
        safeDeleteFile(req.file?.path);
        return res.status(400).json({
          success: false,
          message: 'maxDiscountAmount is required for percentage discount',
        });
      }

      const couponData = {
        code:                 code.toUpperCase(),
        description,
        discount_type:        discountType,
        discount_value:       parseFloat(discountValue),
        min_order_amount:     minOrderAmount    ? parseFloat(minOrderAmount)    : null,
        start_date:           new Date(startDate),
        end_date:             new Date(endDate),
        status:               status === 'true' || status === true,
        usage_limit_per_user: usageLimitPerUser ? parseInt(usageLimitPerUser)   : null,
        total_usage_limit:    totalUsageLimit   ? parseInt(totalUsageLimit)     : null,
        image_url:            imageUrl,
      };

      if (maxDiscountAmount) {
        couponData.max_discount_amount = parseFloat(maxDiscountAmount);
      }

      const coupon = await Coupon.create(couponData);

      return res.status(201).json({ success: true, data: coupon });

    } catch (error) {
      safeDeleteFile(req.file?.path);
      console.error('Create Coupon Error:', error);

      if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors.map(e => ({ field: e.path, message: e.message })),
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to create coupon',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      });
    }
  },
];

// @desc    Update a coupon
// @route   PUT /coupons/:id
// @access  Private/Admin
exports.updateCoupon = [
  handleUpload,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // ✅ FIX: delete newly uploaded file, NOT req.body.image_url (which is undefined)
        safeDeleteFile(req.file?.path);
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const {
        code,
        description,
        discount_type,
        discount_value,
        min_order_amount,
        max_discount_amount,
        start_date,
        end_date,
        status,
        usage_limit_per_user,
        total_usage_limit,
      } = req.body;

      const coupon = await Coupon.findByPk(id);
      if (!coupon) {
        // ✅ FIX: delete newly uploaded file on 404
        safeDeleteFile(req.file?.path);
        return res.status(404).json({ success: false, message: 'Coupon not found' });
      }

      // Check code uniqueness if code is being changed
      if (code && code.toUpperCase() !== coupon.code) {
        const isUnique = await Coupon.isCodeUnique(code);
        if (!isUnique) {
          // ✅ FIX: delete newly uploaded file on duplicate code
          safeDeleteFile(req.file?.path);
          return res.status(400).json({ success: false, message: 'Coupon code already exists' });
        }
      }

      // Validate maxDiscountAmount for percentage type
      const effectiveType = discount_type || coupon.discount_type;
      const effectiveMax  = max_discount_amount !== undefined ? max_discount_amount : coupon.max_discount_amount;
      if (effectiveType === 'PERCENTAGE' && !effectiveMax) {
        safeDeleteFile(req.file?.path);
        return res.status(400).json({
          success: false,
          message: 'maxDiscountAmount is required for percentage discount',
        });
      }

      // ✅ Store old image path BEFORE updating
      const oldImageUrl = coupon.image_url;   // FIX: was coupon.imageUrl (undefined)

      // Build update payload
      const updateData = {
        ...(code              && { code: code.toUpperCase() }),
        ...(description       !== undefined && { description }),
        ...(discount_type     !== undefined && { discount_type }),
        ...(discount_value    !== undefined && { discount_value:    parseFloat(discount_value)    }),
        ...(min_order_amount  !== undefined && { min_order_amount:  min_order_amount  ? parseFloat(min_order_amount)  : null }),
        ...(max_discount_amount !== undefined && { max_discount_amount: max_discount_amount ? parseFloat(max_discount_amount) : null }),
        ...(start_date        && { start_date }),
        ...(end_date          && { end_date }),
        ...(status            !== undefined && { status: status === 'true' || status === true }),
        ...(usage_limit_per_user !== undefined && { usage_limit_per_user: usage_limit_per_user ? parseInt(usage_limit_per_user) : null }),
        ...(total_usage_limit    !== undefined && { total_usage_limit:    total_usage_limit    ? parseInt(total_usage_limit)    : null }),
      };

      // ✅ If new image uploaded — store relative path and delete old one
      if (req.file?.path) {
        updateData.image_url = getRelativePath(req.file.path);
        safeDeleteFile(oldImageUrl);   // delete old image only when new file uploaded
      }

      await coupon.update(updateData);

      const updated = await Coupon.findByPk(id);
      return res.json({ success: true, data: updated });

    } catch (error) {
      // ✅ FIX: delete newly uploaded file on unexpected error
      safeDeleteFile(req.file?.path);
      console.error('Update Coupon Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message,
      });
    }
  },
];

// @desc    Delete a coupon
// @route   DELETE /coupons/:id
// @access  Private/Admin
exports.deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findByPk(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    // ✅ FIX: was coupon.imageUrl (camelCase — undefined); field is image_url
    safeDeleteFile(coupon.image_url);

    await coupon.destroy();

    return res.json({ success: true, data: {} });

  } catch (error) {
    console.error('Delete Coupon Error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get all coupons (paginated)
// @route   GET /coupons
// @access  Private/Admin
exports.getCoupons = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};

    if (status !== undefined) {
      whereClause.status = status === 'true';
    }

    if (search) {
      whereClause[Op.or] = [
        { code:        { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows: coupons } = await Coupon.findAndCountAll({
      where:  whereClause,
      order:  [['created_at', 'DESC']],
      limit:  parseInt(limit),
      offset: parseInt(offset),
    });

    return res.json({
      success: true,
      pagination: {
        total:      count,
        page:       parseInt(page),
        limit:      parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
      data: coupons,
    });

  } catch (error) {
    console.error('Get Coupons Error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get active coupons
// @route   GET /coupons/active
// @access  Public
exports.getActiveCoupons = async (req, res) => {
  try {
    const now = new Date();

    const coupons = await Coupon.findAll({
      where: {
        status:     true,
        start_date: { [Op.lte]: now },
        end_date:   { [Op.gte]: now },
        [Op.or]: [
          { total_usage_limit: null },
          {
            total_usage_limit: { [Op.gt]: 0 },
            [Op.and]: [sequelize.literal('`total_usage_limit` > `total_used`')],
          },
        ],
      },
      order: [['created_at', 'DESC']],
    });

    return res.json({ success: true, data: coupons });

  } catch (error) {
    console.error('Get Active Coupons Error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get coupon by ID
// @route   GET /coupons/:id
// @access  Private/Admin
exports.getCouponById = async (req, res) => {
  try {
    const coupon = await Coupon.findByPk(req.params.id);

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    return res.json({ success: true, data: coupon });

  } catch (error) {
    console.error('Get Coupon By ID Error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Validate coupon code
// @route   POST /coupons/validate
// @access  Public
exports.validateCoupon = async (req, res) => {
  try {
    const { code, userId, amount } = req.body;

    if (!code || !amount) {
      return res.status(400).json({ success: false, message: 'Code and amount are required' });
    }

    const coupon = await Coupon.findOne({
      where: { code: code.toUpperCase(), status: true },
    });

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid or expired coupon code' });
    }

    // Check date validity
    const now = new Date();
    if (new Date(coupon.start_date) > now || new Date(coupon.end_date) < now) {
      return res.status(400).json({ success: false, message: 'This coupon has expired or is not yet active' });
    }

    // Check total usage limit
    if (coupon.total_usage_limit !== null && coupon.total_used >= coupon.total_usage_limit) {
      return res.status(400).json({ success: false, message: 'This coupon has reached its maximum usage limit' });
    }

    // Check minimum order amount
    if (coupon.min_order_amount && Number(amount) < Number(coupon.min_order_amount)) {
      return res.status(400).json({
        success: false,
        message: `Minimum order amount of ₹${coupon.min_order_amount} is required for this coupon`,
      });
    }

    // Check per-user usage limit
    if (userId && coupon.usage_limit_per_user) {
      const { Booking } = require('../db/models');
      const userUsage = await Booking.count({
        where: {
          userId,
          couponId:      coupon.id,
          bookingStatus: { [Op.not]: 'cancelled' },
        },
      });

      if (userUsage >= coupon.usage_limit_per_user) {
        return res.status(400).json({
          success: false,
          message: 'You have reached the maximum usage limit for this coupon',
        });
      }
    }

    const discount = coupon.calculateDiscount(parseFloat(amount));

    return res.json({
      success: true,
      data: {
        coupon: {
          id:                coupon.id,
          code:              coupon.code,
          discountType:      coupon.discount_type,
          discountValue:     coupon.discount_value,
          maxDiscountAmount: coupon.max_discount_amount,
          minOrderAmount:    coupon.min_order_amount,
        },
        discount,
        finalAmount: parseFloat(amount) - discount,
      },
    });

  } catch (error) {
    console.error('Validate Coupon Error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};