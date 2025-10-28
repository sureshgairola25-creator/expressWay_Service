module.exports = (err, req, res, next) => {
  console.log('=== ERROR HANDLER CALLED ===');
  console.log('Error type:', err.constructor.name);
  console.log('Error message:', err.message);
  console.log('Error status:', err.status || err.statusCode);
  console.log('Error stack:', err.stack);

  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';

  // Handle http-errors specifically
  if (err.name === 'BadRequestError' || err.name === 'ConflictError' || err.name === 'UnauthorizedError' || err.name === 'NotFoundError') {
    statusCode = err.statusCode || err.status || 400;
    message = err.message;
  }

  console.log('Sending response:', statusCode, message);

  res.status(statusCode).json({
    success: false,
    message: message
  });
};
