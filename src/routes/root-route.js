const express = require('express');
const path = require('path');

const router = express.Router();
const { indexController } = require('../controllers/indexController');

/**
 * get csrf token
 * @route GET /csrf
 * @returns {object} 200 - User Object
 * @returns {Error} default - Unexpected error
 */

router.get('/csrf', indexController.getCSRF);

router.get('/', indexController.getInfo);

// Route to handle the Cashfree return URL
router.get('/bookings/:orderId', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/booking.html'));
});

module.exports = router;
