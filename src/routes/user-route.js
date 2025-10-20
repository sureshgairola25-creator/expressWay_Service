const express = require('express');
const userController = require('../controllers/userController');
const { protect } = require('../../middleware/auth');

const router = express.Router();

// @route   POST /api/users/register
// @desc    Register a new user
// @access  Public
router.post('/register', userController.register);

// @route   POST /api/users/login
// @desc    Login a user and get token
// @access  Public
router.post('/login', userController.login);

// @route   POST /api/users/google-login
// @desc    Login or register a user with Google
// @access  Public
router.post('/google-login', userController.googleLogin);

// @route   GET /api/users/me
// @desc    Get current user profile
// @access  Private
router.get('/me', protect, userController.getMe);

// @route   PUT /api/users/update/:id
// @desc    Update user profile
// @access  Private (should be protected in a real app)
router.put('/update/:id', userController.updateProfile);

module.exports = router;
