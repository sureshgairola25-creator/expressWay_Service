const { isHttpError } = require('http-errors');

module.exports = (app) => {
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (isHttpError(err)) {
      const code = err.getCode ? err.getCode() : 400;

      return res.status(code).json({
        status: 'error',
        message: err.message,
      });
    }

    return res.status(500).json({
      status: 'error',
      message: err.message,
    });
  });
};
