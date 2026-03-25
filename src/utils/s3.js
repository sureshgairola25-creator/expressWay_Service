// config/s3.js
// ─────────────────────────────────────────────────────────────
// AWS S3 configuration + multer-s3 upload middleware
// ─────────────────────────────────────────────────────────────

const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// ── 1. Create S3 client ──────────────────────────────────────
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ── 2. Allowed image types ───────────────────────────────────
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, and WEBP images are allowed'), false);
  }
};

// ── 3. Multer-S3 storage config ──────────────────────────────
const storage = multerS3({
  s3: s3Client,
  bucket: process.env.AWS_S3_BUCKET_NAME,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  metadata: (req, file, cb) => {
    cb(null, { fieldName: file.fieldname });
  },
  key: (req, file, cb) => {
    // Save as: cars/uuid-originalname.ext
    const ext = path.extname(file.originalname);
    const fileName = `cars/${uuidv4()}${ext}`;
    cb(null, fileName);
  },
});

// ── 4. Export upload middleware ──────────────────────────────
const uploadCarImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
}).single('carImage'); // field name must be "carImage"

module.exports = { s3Client, uploadCarImage };