const { BackgroundImage } = require('../db/models');
const path = require('path');
const fs = require('fs');
const asyncHandler = require('../../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Upload background image
// @route   POST /api/bg-images/upload
// @access  Private/Admin
exports.uploadBackgroundImage = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new ErrorResponse('Please upload a file', 400));
  }

  const file = req.file;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const fileUrl = `/uploads/bg/${file.filename}`;
  const fullUrl = `${baseUrl}${fileUrl}`;

  const backgroundImage = await BackgroundImage.create({
    filename: file.filename,
    url: fullUrl
  });

  res.status(201).json({
    success: true,
    data: backgroundImage
  });
});

// @desc    Get all background images
// @route   GET /api/bg-images
// @access  Public
exports.getBackgroundImages = asyncHandler(async (req, res, next) => {
  const images = await BackgroundImage.findAll({
    order: [['createdAt', 'DESC']]
  });

  res.status(200).json({
    success: true,
    count: images.length,
    data: images
  });
});

// @desc    Delete background image
// @route   DELETE /api/bg-images/:id
// @access  Private/Admin
exports.deleteBackgroundImage = asyncHandler(async (req, res, next) => {
  const image = await BackgroundImage.findByPk(req.params.id);

  if (!image) {
    return next(new ErrorResponse(`Image not found with id of ${req.params.id}`, 404));
  }

  // Delete file from filesystem
  const filePath = path.join(__dirname, '../../public/uploads/bg', image.filename);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  await image.destroy();

  res.status(200).json({
    success: true,
    data: {}
  });
});
