/* eslint-disable no-undef */
const { NotFound, InternalServerError } = require('http-errors');
const Route = require('../db/models/route');

const routeService = {
  /**
   * Create a new route
   * @param {Object} routeData - Route data
   * @returns {Object} Created route
   */
  createRoute: (routeData) => {
    try {
      const route = new Route(routeData);
      return route.save();
    } catch (e) {
      throw new InternalServerError('Failed to create route');
    }
  },

  /**
   * Get all routes
   * @param {Object} filter - Filter criteria
   * @returns {Array} List of routes
   */
  getAllRoutes: (filter = {}) => {
    try {
      return Route.find(filter).sort({ createdAt: -1 });
    } catch (e) {
      throw new InternalServerError('Failed to fetch routes');
    }
  },

  /**
   * Get route by ID
   * @param {string} id - Route ID
   * @returns {Object} Route details
   */
  getRouteById: (id) => {
    try {
      const route = Route.findById(id);
      if (!route) {
        throw new NotFound('Route not found');
      }
      return route;
    } catch (e) {
      if (e instanceof NotFound) throw e;
      throw new InternalServerError('Failed to fetch route');
    }
  },

  /**
   * Update route by ID
   * @param {string} id - Route ID
   * @param {Object} updateData - Data to update
   * @returns {Object} Updated route
   */
  updateRoute: (id, updateData) => {
    try {
      const route = Route.findByIdAndUpdate(
        id,
        updateData,
        {
          new: true,
          runValidators: true
        }
      );
      
      if (!route) {
        throw new NotFound('Route not found');
      }
      
      return route;
    } catch (e) {
      if (e instanceof NotFound) throw e;
      throw new InternalServerError('Failed to update route');
    }
  },

  /**
   * Delete route by ID
   * @param {string} id - Route ID
   * @returns {boolean} Success status
   */
  deleteRoute: (id) => {
    try {
      const route = Route.findByIdAndDelete(id);
      if (!route) {
        throw new NotFound('Route not found');
      }
      return true;
    } catch (e) {
      if (e instanceof NotFound) throw e;
      throw new InternalServerError('Failed to delete route');
    }
  }
};

module.exports = routeService;
