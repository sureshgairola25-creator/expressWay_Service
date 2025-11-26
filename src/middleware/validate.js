const { validationResult } = require('express-validator');
const ErrorResponse = require('../utils/errorResponse');

/**
 * Middleware to validate request using express-validator
 * @param {Array} validations - Array of validation chains
 * @returns {Function} Express middleware function
 */
const validate = (validations) => {
  return async (req, res, next) => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    // Check for validation errors
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    // Format errors
    const errorMessages = errors.array().map(err => ({
      field: err.param,
      message: err.msg,
      value: err.value
    }));
    console.log(errorMessages);
    
    return next(new ErrorResponse('Validation failed', 400, errorMessages));
  };
};

module.exports = { validate };
