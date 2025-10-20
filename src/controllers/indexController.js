/* eslint-disable no-undef */
const { InternalServerError, isHttpError } = require('http-errors');

const indexController = {
  getCSRF: (req, res, next) => {
    try {
      const csrf = req.csrfToken();
      res.status(200).json({ _csrf: csrf });
    } catch (e) {
      if (isHttpError(e)) {
        next(e);
      } else {
        next(new InternalServerError('Something Went Wrong'));
      }
    }
  },
  getInfo: (req, res, next) => {
    try {
      res.status(401).json({
        status: 'error',
        message: 'Access Denied',
      });
    } catch (e) {
      if (isHttpError(e)) {
        next(e);
      } else {
        next(new InternalServerError('Something Went Wrong'));
      }
    }
  },
};

module.exports = { indexController };
