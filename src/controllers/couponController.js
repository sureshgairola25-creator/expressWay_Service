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
        // If there are validation errors, delete the uploaded file if exists
        if (req.file) {
          deleteFile(req.body.imageUrl);
        }
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        code,
        description,
        discountType,
        discountValue,
        minOrderAmount,
        maxDiscountAmount,
        startDate,
        endDate,
        status = true,
        usageLimitPerUser,
        totalUsageLimit
      } = req.body;

      // Check if coupon code already exists
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

      const coupon = await Coupon.create({
        code: code.toUpperCase(),
        description,
        discountType,
        discountValue: parseFloat(discountValue),
        minOrderAmount: minOrderAmount ? parseFloat(minOrderAmount) : null,
        maxDiscountAmount: maxDiscountAmount ? parseFloat(maxDiscountAmount) : null,
        startDate,
        endDate,
        status,
        usageLimitPerUser: usageLimitPerUser ? parseInt(usageLimitPerUser) : null,
        totalUsageLimit: totalUsageLimit ? parseInt(totalUsageLimit) : null,
        imageUrl: req.body.imageUrl || null
      });

      res.status(201).json({
        success: true,
        data: coupon
      });
    } catch (error) {
      // Clean up uploaded file if there's an error
      if (req.file) {
        deleteFile(req.body.imageUrl);
      }
      console.error('Create Coupon Error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
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
          deleteFile(req.body.imageUrl);
        }
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const {
        code,
        description,
        discountType,
        discountValue,
        minOrderAmount,
        maxDiscountAmount,
        startDate,
        endDate,
        status,
        usageLimitPerUser,
        totalUsageLimit
      } = req.body;

      // Find the coupon
      let coupon = await Coupon.findByPk(id);
      if (!coupon) {
        if (req.file) {
          deleteFile(req.body.imageUrl);
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
        ...(discountType && { discountType }),
        ...(discountValue && { discountValue: parseFloat(discountValue) }),
        ...(minOrderAmount !== undefined && { 
          minOrderAmount: minOrderAmount ? parseFloat(minOrderAmount) : null 
        }),
        ...(maxDiscountAmount !== undefined && { 
          maxDiscountAmount: maxDiscountAmount ? parseFloat(maxDiscountAmount) : null 
        }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(status !== undefined && { status }),
        ...(usageLimitPerUser !== undefined && { 
          usageLimitPerUser: usageLimitPerUser ? parseInt(usageLimitPerUser) : null 
        }),
        ...(totalUsageLimit !== undefined && { 
          totalUsageLimit: totalUsageLimit ? parseInt(totalUsageLimit) : null 
        }),
        ...(req.body.imageUrl && { imageUrl: req.body.imageUrl })
      };

      // Validate maxDiscountAmount for percentage coupons
      if ((discountType || coupon.discountType) === 'PERCENTAGE' && 
          (updateData.maxDiscountAmount === undefined ? !coupon.maxDiscountAmount : !updateData.maxDiscountAmount)) {
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
      order: [['createdAt', 'DESC']],
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
      },
      order: [['createdAt', 'DESC']]
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
        startDate: { [Op.lte]: new Date() },
        endDate: { [Op.gte]: new Date() }
      }
    });
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired coupon code'
      });
    }
    
    // Check total usage limit
    if (coupon.totalUsageLimit !== null && coupon.totalUsed >= coupon.totalUsageLimit) {
      return res.status(400).json({
        success: false,
        message: 'This coupon has reached its maximum usage limit'
      });
    }
    
    // Check minimum order amount
    if (coupon.minOrderAmount && amount < coupon.minOrderAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum order amount of ${coupon.minOrderAmount} is required for this coupon`
      });
    }
    
    // Check per user usage limit if user is provided
    if (userId && coupon.usageLimitPerUser) {
      // You would typically check the user's usage against the booking table
      // This is a simplified example
      const userUsage = 0; // Replace with actual usage check
      
      if (userUsage >= coupon.usageLimitPerUser) {
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
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          maxDiscountAmount: coupon.maxDiscountAmount,
          minOrderAmount: coupon.minOrderAmount
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
