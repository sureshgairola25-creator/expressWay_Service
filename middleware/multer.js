const shell = require('shelljs');

const fs = require('fs');
const multer = require('multer');

// multer configuration for profile
const storagePicture = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = `./public/profile/pic/`;
    if (!fs.existsSync(dir)) {
      shell.mkdir('-p', dir);
    }
    cb(null, dir); // where to store it
  },
  filename: function (req, file, cb) {
    if (file.fileSize) {
      return cb(new Error());
    }
    if (!file.originalname.toLowerCase().match(/\.(jpg|png|gif|jpeg|jfif|svg)$/)) {
      const err = new Error();
      err.code = 'filetype'; // to check on file type
      return cb(err, null);
    }
    const name = file.originalname.toLowerCase();
    const ext = name.substr(file.originalname.lastIndexOf('.') + 1);
    const rename = `${Date.now()}.${ext}`;
    return cb(null, rename);
  },
});
// multer configuration for bundle files
const uploadPicture = multer({
  storage: storagePicture,
  limits: { fileSize: 2000000 }, // Max file size: 2MB
}).any();

// Multer configuration for background images
const storageBackground = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = `./public/uploads/bg/`;
    if (!fs.existsSync(dir)) {
      shell.mkdir('-p', dir);
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    if (file.fileSize) {
      return cb(new Error());
    }
    if (!file.originalname.toLowerCase().match(/\.(jpg|png|gif|jpeg|jfif|svg|webp)$/)) {
      const err = new Error();
      err.code = 'filetype';
      return cb(err, null);
    }
    const ext = file.originalname.split('.').pop().toLowerCase();
    const rename = `bg-${Date.now()}.${ext}`;
    return cb(null, rename);
  },
});

const uploadBackground = multer({
  storage: storageBackground,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max file size
}).single('image'); // Changed from 'background' to 'image' to match the form field name

const backgroundUpload = (req, res, next) => {
  uploadBackground(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'File size is too large. Max limit is 5MB' });
      } else if (err.code === 'filetype') {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid file type. Only JPG, PNG, GIF, and WebP are allowed.' 
        });
      } else {
        console.error('Background upload error:', err);
        return res.status(400).json({ 
          success: false, 
          error: 'File could not be uploaded' 
        });
      }
    }
    next();
  });
};

const pictureUpload = async (req, res, next) => {
  req.setTimeout(60 * 60 * 1000);
  uploadPicture(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ message: 'File size is too large.  Max limit is 2MB' });
      } else if (err.code === 'filetype') {
        res.status(400).json({
          message: 'File type is invalid. Only accepted .png/.jpg/.jpeg/.svg/ .jfif  .',
        });
      } else {
        console.error(err);
        res.status(400).json({ message: 'File was not able to be uploaded' });
      }
    } else {
      next();
    }
  });
};
module.exports = { 
  pictureUpload, 
  backgroundUpload 
};
