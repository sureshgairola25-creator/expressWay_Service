const express = require('express');
const userController = require('../controllers/userController');
const { protect } = require('../../middleware/auth');

const router = express.Router();


// @route   POST /api/users/signup
// @desc    Signup user with email or mobile
// @access  Public
router.post('/signup', userController.signup);

// @route   POST /api/users/verify
// @desc    Verify user with token/OTP
// @access  Public
router.post('/verify', userController.verify);

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
// @desc    Get current user's profile
// @access  Private
router.get('/me', protect, userController.getMe);

// @route   GET /api/users/:userId/rides
// @desc    Get user's rides (upcoming and past)
// @access  Private
router.get('/:userId/rides', userController.getUserRides);

// @route   PUT /api/users/update/:id
// @desc    Update user profile
// @access  Private
router.put('/update/:id', protect, userController.updateProfile);

// @route   POST /api/users/set-password
// @desc    Set password for verified user
// @access  Public
router.post('/set-password', userController.setPassword);

// @route   POST /api/users/logout
// @desc    Logout user / invalidate token
// @access  Private
router.post('/logout', protect, userController.logout);

// @route   GET /users
// @desc    Get all users (Admin only)
// @access  Private/Admin
router.get('/users', userController.getUsers);

module.exports = router;
