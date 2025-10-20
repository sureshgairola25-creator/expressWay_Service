/* eslint-disable no-undef */
const { InternalServerError, isHttpError } = require('http-errors');
const routeService = require('../services/routeService');

const routeController = {
  /**
   * Create a new route
   * @route POST /api/routes
   * @access Private/Admin
   */
  createRoute: (req, res, next) => {
    try {
      const route = routeService.createRoute(req.body);
      res.status(201).json({
        status: 'success',
        data: {
          route
        }
      });
    } catch (e) {
      if (isHttpError(e)) {
        next(e);
      } else {
        next(new InternalServerError('Failed to create route'));
      }
    }
  },

  /**
   * Get all routes
   * @route GET /api/routes
   * @access Public
   */
  getAllRoutes: (req, res, next) => {
    try {
      const routes = routeService.getAllRoutes({ active: true });
      res.status(200).json({
        status: 'success',
        results: routes.length,
        data: {
          routes
        }
      });
    } catch (e) {
      if (isHttpError(e)) {
        next(e);
      } else {
        next(new InternalServerError('Failed to fetch routes'));
      }
    }
  },

  /**
   * Get single route
   * @route GET /api/routes/:id
   * @access Public
   */
  getRoute: (req, res, next) => {
    try {
      const route = routeService.getRouteById(req.params.id);
      res.status(200).json({
        status: 'success',
        data: {
          route
        }
      });
    } catch (e) {
      if (isHttpError(e)) {
        next(e);
      } else {
        next(new InternalServerError('Failed to fetch route'));
      }
    }
  },

  /**
   * Update route
   * @route PATCH /api/routes/:id
   * @access Private/Admin
   */
  updateRoute: (req, res, next) => {
    try {
      const route = routeService.updateRoute(req.params.id, req.body);
      res.status(200).json({
        status: 'success',
        data: {
          route
        }
      });
    } catch (e) {
      if (isHttpError(e)) {
        next(e);
      } else {
        next(new InternalServerError('Failed to update route'));
      }
    }
  },

  /**
   * Delete route
   * @route DELETE /api/routes/:id
   * @access Private/Admin
   */
  deleteRoute: (req, res, next) => {
    try {
      routeService.deleteRoute(req.params.id);
      res.status(204).json({
        status: 'success',
        data: null
      });
    } catch (e) {
      if (isHttpError(e)) {
        next(e);
      } else {
        next(new InternalServerError('Failed to delete route'));
      }
    }
  }
};

module.exports = { routeController };
