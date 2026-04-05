// controllers/carController.js
// ─────────────────────────────────────────────────────────────
// Updated to handle image upload via multer-s3
// ─────────────────────────────────────────────────────────────

const carService = require('../services/carService');
const asyncHandler = require('../../middleware/async');
const { uploadCarImage } = require('../utils/s3');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client } = require('../utils/s3');

const carController = {

  // ── Create Car (with optional image) ──────────────────────
  createCar: async (req, res) => {

  if (req.file) {
    req.body.imageUrl = req.file.location;
  }

  const car = await carService.createCar(req.body);

  res.status(201).json({
    success: true,
    data: car
  });

},

  // ── Get All Cars ───────────────────────────────────────────
  getAllCars: asyncHandler(async (req, res) => {
    const { data, pagination } = await carService.getAllCars(req.query);
    res.status(200).json({ success: true, data, pagination });
  }),

  // ── Get Car By ID ──────────────────────────────────────────
  getCarById: asyncHandler(async (req, res) => {
    const car = await carService.getCarById(req.params.id);
    res.status(200).json({ success: true, data: car });
  }),

  // ── Update Car (with optional new image) ──────────────────
  updateCar: async (req, res) => {


      // If a new image was uploaded
      if (req.file) {
        // Delete old image from S3 if it exists
        const existingCar = await carService.getCarById(req.params.id);
        if (existingCar.imageUrl) {
          await carController.deleteS3Image(existingCar.imageUrl);
        }
        req.body.imageUrl = req.file.location;
      }

      const car = await carService.updateCar(req.params.id, req.body);
      res.status(200).json({ success: true, data: car });
  },

  // ── Delete Car (also removes image from S3) ───────────────
  deleteCar: asyncHandler(async (req, res) => {
    const car = await carService.getCarById(req.params.id);

    // Delete image from S3 if exists
    if (car.imageUrl) {
      await carController.deleteS3Image(car.imageUrl);
    }

    const result = await carService.deleteCar(req.params.id);
    res.status(200).json({ success: true, data: result });
  }),

  // ── Helper: Delete image from S3 by URL ───────────────────
  deleteS3Image: async (imageUrl) => {
    try {
      // Extract key from URL
      // URL format: https://bucket.s3.region.amazonaws.com/cars/uuid.jpg
      const url = new URL(imageUrl);
      const key = url.pathname.substring(1); // remove leading "/"

      await s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: key,
      }));
    } catch (err) {
      // Log but don't throw — don't block car deletion if S3 delete fails
      console.error('Failed to delete S3 image:', err.message);
    }
  },
};

module.exports = carController;