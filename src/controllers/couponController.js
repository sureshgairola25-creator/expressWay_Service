const { Coupon, sequelize } = require('../db/models');
const { handleUpload, deleteFile } = require('../utils/fileUpload');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');

// @desc    Create a new coupon
// @route   POST /admin/coupons
// @access  Private/Admin
exports.createCoupon = [
  handleUpload,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        if (req.file) {
          deleteFile(req.file.path);
        }
        return res.status(400).json({ errors: errors.array() });
      }

      // Validate required fields
      const requiredFields = ['code', 'discount_type', 'discount_value', 'start_date', 'end_date'];
      const missingFields = requiredFields.filter(field => !req.body[field]);
      
      if (missingFields.length > 0) {
        if (req.file) {
          deleteFile(req.file.path);
        }
        return res.status(400).json({
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`
        });
      }

      const {
        code,
        description = null,
        discount_type: discountType,
        discount_value: discountValue,
        min_order_amount: minOrderAmount = null,
        max_discount_amount: maxDiscountAmount = null,
        start_date: startDate,
        end_date: endDate,
        status = true,
        usage_limit_per_user: usageLimitPerUser = null,
        total_usage_limit: totalUsageLimit = null,
      } = req.body;

      // Handle file upload
      const imageUrl = req.file ? req.file.path : null;

      // Check if coupon code already exists
      const existingCoupon = await Coupon.findOne({ where: { code: code.toUpperCase() } });
      if (existingCoupon) {
        if (req.file) {
          deleteFile(req.body.imageUrl);
        }
        return res.status(400).json({
          success: false,
          message: 'Coupon code already exists'
        });
      }

      // Validate maxDiscountAmount for percentage coupons
      if (discountType === 'PERCENTAGE' && !maxDiscountAmount) {
        if (req.file) {
          deleteFile(req.body.imageUrl);
        }
        return res.status(400).json({
          success: false,
          message: 'maxDiscountAmount is required for percentage discount'
        });
      }

      // Prepare coupon data
      const couponData = {
        code: code.toUpperCase(),
        description,
        discount_type: discountType,
        discount_value: parseFloat(discountValue),
        min_order_amount: minOrderAmount ? parseFloat(minOrderAmount) : null,
        start_date: new Date(startDate),
        end_date: new Date(endDate),
        status: Boolean(status),
        usage_limit_per_user: usageLimitPerUser ? parseInt(usageLimitPerUser) : null,
        total_usage_limit: totalUsageLimit ? parseInt(totalUsageLimit) : null,
        image_url: imageUrl
      };

      // Add max_discount_amount only if provided
      if (maxDiscountAmount) {
        couponData.max_discount_amount = parseFloat(maxDiscountAmount);
      }

      const coupon = await Coupon.create(couponData);

      res.status(201).json({
        success: true,
        data: coupon
      });
    } catch (error) {
      // Clean up uploaded file if there's an error
      if (req.file && req.file.path) {
        try {
          await deleteFile(req.file.path);
        } catch (err) {
          console.error('Error deleting uploaded file:', err);
        }
      }
      
      console.error('Create Coupon Error:', error);
      
      // Handle validation errors
      if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
        const errors = error.errors.map(err => ({
          field: err.path,
          message: err.message
        }));
        
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors
        });
      }
      
      // Handle other errors
      res.status(500).json({
        success: false,
        message: 'Failed to create coupon',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
];

// @desc    Update a coupon
// @route   PUT /admin/coupons/:id
// @access  Private/Admin
exports.updateCoupon = [
  handleUpload,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // If there are validation errors, delete the uploaded file if exists
        if (req.file) {
          deleteFile(req.body.image_url);
        }
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
        total_usage_limit
      } = req.body;

      // Find the coupon
      let coupon = await Coupon.findByPk(id);
      if (!coupon) {
        if (req.file) {
          deleteFile(req.body.image_url);
        }
        return res.status(404).json({
          success: false,
          message: 'Coupon not found'
        });
      }

      // Check if code is being changed and if the new code already exists
      if (code && code.toUpperCase() !== coupon.code) {
        const codeExists = await Coupon.isCodeUnique(code);
        if (!codeExists) {
          if (req.file) {
            deleteFile(req.body.imageUrl);
          }
          return res.status(400).json({
            success: false,
            message: 'Coupon code already exists'
          });
        }
      }

      // Store old image path for cleanup
      const oldImageUrl = coupon.imageUrl;

      // Update coupon
      const updateData = {
        ...(code && { code: code.toUpperCase() }),
        ...(description !== undefined && { description }),
        ...(discount_type !== undefined && { discount_type }),
        ...(discount_value !== undefined && { discount_value: parseFloat(discount_value) }),
        ...(min_order_amount !== undefined && { 
          min_order_amount: min_order_amount ? parseFloat(min_order_amount) : null 
        }),
        ...(max_discount_amount !== undefined && { 
          max_discount_amount: max_discount_amount ? parseFloat(max_discount_amount) : null 
        }),
        ...(start_date && { start_date }),
        ...(end_date && { end_date }),
        ...(status !== undefined && { status }),
        ...(usage_limit_per_user !== undefined && { 
          usage_limit_per_user: usage_limit_per_user ? parseInt(usage_limit_per_user) : null 
        }),
        ...(total_usage_limit !== undefined && { 
          total_usage_limit: total_usage_limit ? parseInt(total_usage_limit) : null 
        }),
        ...(req.body.image_url && { image_url: req.body.image_url })
      };

      // Validate maxDiscountAmount for percentage coupons
      if ((discount_type || coupon.discount_type) === 'PERCENTAGE' && 
          (updateData.max_discount_amount === undefined ? !coupon.max_discount_amount : !updateData.max_discount_amount)) {
        if (req.file) {
          deleteFile(req.body.imageUrl);
        }
        return res.status(400).json({
          success: false,
          message: 'maxDiscountAmount is required for percentage discount'
        });
      }

      await coupon.update(updateData);

      // Delete old image if a new one was uploaded
      if (req.body.imageUrl && oldImageUrl) {
        deleteFile(oldImageUrl);
      }

      // Fetch the updated coupon
      coupon = await Coupon.findByPk(id);

      res.json({
        success: true,
        data: coupon
      });
    } catch (error) {
      // Clean up uploaded file if there's an error
      if (req.file) {
        deleteFile(req.body.imageUrl);
      }
      console.error('Update Coupon Error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  }
];

// @desc    Delete a coupon
// @route   DELETE /admin/coupons/:id
// @access  Private/Admin
exports.deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findByPk(id);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    // Delete the associated image if it exists
    if (coupon.imageUrl) {
      deleteFile(coupon.imageUrl);
    }

    await coupon.destroy();

    res.json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error('Delete Coupon Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get all coupons
// @route   GET /admin/coupons
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
        { code: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }
    
    const { count, rows: coupons } = await Coupon.findAndCountAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    const totalPages = Math.ceil(count / limit);
    
    res.json({
      success: true,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages
      },
      data: coupons
    });
  } catch (error) {
    console.error('Get Coupons Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};


// @desc    Get active coupons
// @route   GET /admin/coupons/active
// @access  Public
exports.getActiveCoupons = async (req, res) => {
  try {
    const now = new Date();
    
    const coupons = await Coupon.findAll({
      where: {
        status: true,
        start_date: { [Op.lte]: now },
        end_date: { [Op.gte]: now },
        [Op.or]: [
          { total_usage_limit: null },
          { 
            total_usage_limit: { [Op.gt]: 0 },
            [Op.and]: [
              sequelize.literal('"total_usage_limit" > "total_used"')
            ]
          }
        ]
      },
      order: [['created_at', 'DESC']]
    });
    
    res.json({
      success: true,
      data: coupons
    });
  } catch (error) {
    console.error('Get Active Coupons Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get coupon by ID
// @route   GET /admin/coupons/:id
// @access  Private/Admin
exports.getCouponById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const coupon = await Coupon.findByPk(id);
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }
    
    res.json({
      success: true,
      data: coupon
    });
  } catch (error) {
    console.error('Get Coupon By ID Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Validate coupon code
// @route   POST /coupons/validate
// @access  Public
exports.validateCoupon = async (req, res) => {
  try {
    const { code, userId, amount } = req.body;
    
    if (!code || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Code and amount are required'
      });
    }
    
    const coupon = await Coupon.findOne({
      where: { 
        code: code.toUpperCase(),
        status: true,
      }
    });
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired coupon code'
      });
    }
    
    // Check total usage limit
    if (coupon.total_usage_limit !== null && coupon.total_used >= coupon.total_usage_limit) {
      return res.status(400).json({
        success: false,
        message: 'This coupon has reached its maximum usage limit'
      });
    }
    
    // Check minimum order amount
    // console.log(coupon.min_order_amount, amount,typeof amount,typeof coupon.min_order_amount,"----------------");
    
    if (coupon.min_order_amount && Number(amount) < Number(coupon.min_order_amount)) {
      return res.status(400).json({
        success: false,
        message: `Minimum order amount above of ${coupon.min_order_amount} is required for this coupon`
      });
    }
    
    // Check per user usage limit if user is provided
    if (userId && coupon.usage_limit_per_user) {
      // You would typically check the user's usage against the booking table
      // This is a simplified example
      const userUsage = 0; // Replace with actual usage check
      
      if (userUsage >= coupon.usage_limit_per_user) {
        return res.status(400).json({
          success: false,
          message: 'You have reached the maximum usage limit for this coupon'
        });
      }
    }
    
    // Calculate discount
    const discount = coupon.calculateDiscount(parseFloat(amount));
    
    res.json({
      success: true,
      data: {
        coupon: {
          id: coupon.id,
          code: coupon.code,
          discountType: coupon.discount_type,
          discountValue: coupon.discount_value,
          maxDiscountAmount: coupon.max_discount_amount,
          minOrderAmount: coupon.min_order_amount
        },
        discount,
        finalAmount: parseFloat(amount) - discount
      }
    });
    
  } catch (error) {
    console.error('Validate Coupon Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
