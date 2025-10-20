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
module.exports = { pictureUpload };
