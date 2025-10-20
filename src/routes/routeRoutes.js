const express = require('express');
const router = express.Router();
const { routeController } = require('../controllers/routeController');

/**
 * @swagger
 * /api/route/create:
 *   post:
 *     summary: Create a new route
 *     responses:
 *       201:
 *         description: Route created successfully
 *       400:
 *         description: Invalid input
 */
router.post('/create', routeController.createRoute);

/**
 * @swagger
 * /api/route:
 *   get:
 *     summary: Get all routes
 *     responses:
 *       200:
 *         description: List of routes
 */
router.get('/', routeController.getAllRoutes);

/**
 * @swagger
 * /api/route/{id}:
 *   get:
 *     summary: Get a route by ID
 *     responses:
 *       200:
 *         description: Route details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Route'
 *       404:
 *         description: Route not found
 */
router.get('/:id', routeController.getRoute);

/**
 * @swagger
 * /api/route/{id}:
 *   put:
 *     summary: Update a route
 *     responses:
 *       200:
 *         description: Route updated successfully
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Route not found
 */
router.put('/:id', routeController.updateRoute);

/**
 * @swagger
 * /api/route/{id}:
 *   delete:
 *     summary: Delete a route
 *     responses:
 *       204:
 *         description: Route deleted successfully
 *       404:
 *         description: Route not found
 */
router.delete('/:id', routeController.deleteRoute);

module.exports = router;
