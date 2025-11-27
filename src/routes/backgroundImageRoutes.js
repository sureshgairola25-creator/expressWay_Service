const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middleware/auth');
const { 
  uploadBackgroundImage, 
  getBackgroundImages, 
  deleteBackgroundImage 
} = require('../controllers/backgroundImageController');
const { backgroundUpload } = require('../../middleware/multer');

// Public routes
router.get('/', getBackgroundImages);

// Protected routes (Admin only)
router.use(protect);
router.use(authorize('admin'));

router.post('/upload', backgroundUpload, uploadBackgroundImage);
router.delete('/:id', deleteBackgroundImage);

module.exports = router;
