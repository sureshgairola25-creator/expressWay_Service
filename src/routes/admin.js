const express = require('express');
const { auth } = require('../lib/jwt');

const router = express.Router();
// const { badgeController } = require('../controllers/badgeController');
const { pictureUpload } = require('../services/multer');

/**
 * @route POST /badge/add
 * @group BADGE API - Endpoints related to Badge.
 * @returns {object} 200 - Badge Object
 * @returns {Error}  default - Unexpected error
 */
// router.post('/add', auth, badgeController.saveBadge);


module.exports = router;