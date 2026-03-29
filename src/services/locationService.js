// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/services/locationService.js  (or routeService.js)
// Fixed: was using MongoDB/Mongoose — now uses Sequelize/MySQL
// Fixed: missing await on all DB calls
// Fixed: proper error handling
// ─────────────────────────────────────────────────────────────────────────────

const { NotFound, BadRequest, InternalServerError } = require('http-errors');
const db = require('../db/models');
const { StartLocation, EndLocation, PickupPoint, DropPoint } = db;

const locationService = {

  // ── START LOCATIONS ────────────────────────────────────────────────────────

  getAllStartLocations: async () => {
    try {
      const locations = await StartLocation.findAll({
        order: [['name', 'ASC']],
      });
      return locations;
    } catch (e) {
      console.error('[getAllStartLocations]', e);
      throw new InternalServerError('Failed to fetch start locations');
    }
  },

  createStartLocation: async (data) => {
    const { name } = data;
    if (!name || !name.trim()) throw new BadRequest('Start location name is required');
    try {
      const existing = await StartLocation.findOne({ where: { name: name.trim() } });
      if (existing) throw new BadRequest(`Start location "${name}" already exists`);

      const location = await StartLocation.create({ name: name.trim() });
      return location;
    } catch (e) {
      if (e.status) throw e;
      console.error('[createStartLocation]', e);
      throw new InternalServerError('Failed to create start location');
    }
  },

  updateStartLocation: async (id, data) => {
    const { name } = data;
    if (!name || !name.trim()) throw new BadRequest('Name is required');
    try {
      const location = await StartLocation.findByPk(id);
      if (!location) throw new NotFound('Start location not found');
      await location.update({ name: name.trim() });
      return location;
    } catch (e) {
      if (e.status) throw e;
      console.error('[updateStartLocation]', e);
      throw new InternalServerError('Failed to update start location');
    }
  },

  deleteStartLocation: async (id) => {
    try {
      const location = await StartLocation.findByPk(id);
      if (!location) throw new NotFound('Start location not found');
      await location.destroy();
      return { message: 'Start location deleted successfully' };
    } catch (e) {
      if (e.status) throw e;
      console.error('[deleteStartLocation]', e);
      throw new InternalServerError('Failed to delete start location');
    }
  },

  // ── END LOCATIONS ──────────────────────────────────────────────────────────

  getAllEndLocations: async () => {
    try {
      const locations = await EndLocation.findAll({
        order: [['name', 'ASC']],
      });
      return locations;
    } catch (e) {
      console.error('[getAllEndLocations]', e);
      throw new InternalServerError('Failed to fetch end locations');
    }
  },

  createEndLocation: async (data) => {
    const { name, startLocationId } = data;
    if (!name || !name.trim())  throw new BadRequest('End location name is required');
    if (!startLocationId)       throw new BadRequest('startLocationId is required');
    try {
      const startLoc = await StartLocation.findByPk(startLocationId);
      if (!startLoc) throw new NotFound('Start location not found');

      const location = await EndLocation.create({
        name:            name.trim(),
        startLocationId: parseInt(startLocationId),
      });
      return location;
    } catch (e) {
      if (e.status) throw e;
      console.error('[createEndLocation]', e);
      throw new InternalServerError('Failed to create end location');
    }
  },

  updateEndLocation: async (id, data) => {
    const { name } = data;
    if (!name || !name.trim()) throw new BadRequest('Name is required');
    try {
      const location = await EndLocation.findByPk(id);
      if (!location) throw new NotFound('End location not found');
      await location.update({ name: name.trim() });
      return location;
    } catch (e) {
      if (e.status) throw e;
      console.error('[updateEndLocation]', e);
      throw new InternalServerError('Failed to update end location');
    }
  },

  deleteEndLocation: async (id) => {
    try {
      const location = await EndLocation.findByPk(id);
      if (!location) throw new NotFound('End location not found');
      await location.destroy();
      return { message: 'End location deleted successfully' };
    } catch (e) {
      if (e.status) throw e;
      console.error('[deleteEndLocation]', e);
      throw new InternalServerError('Failed to delete end location');
    }
  },

  // locationService.js mein add karo — existing functions ke saath

getLocationInfo: async ({ startLocation, endLocation, pickupPoint, dropPoint }) => {
  try {
    const [start, end, pickup, drop] = await Promise.all([
      StartLocation.findByPk(startLocation, { attributes: ['id', 'name'] }),
      EndLocation.findByPk(endLocation,     { attributes: ['id', 'name'] }),
      PickupPoint.findByPk(pickupPoint,     { attributes: ['id', 'name'] }),
      DropPoint.findByPk(dropPoint,         { attributes: ['id', 'name'] }),
    ]);

    if (!start || !end || !pickup || !drop) {
      throw new NotFound('One or more locations not found');
    }

    return {
      startLocation: { id: start.id, name: start.name },
      endLocation:   { id: end.id,   name: end.name   },
      pickupPoint:   { id: pickup.id, name: pickup.name },
      dropPoint:     { id: drop.id,   name: drop.name  },
    };
  } catch (e) {
    if (e.status) throw e;
    console.error('[getLocationInfo]', e);
    throw new InternalServerError('Failed to fetch location info');
  }
},

  // ── PICKUP POINTS ──────────────────────────────────────────────────────────

  getPickupPointsByStartLocation: async (startLocationId) => {
    try {
      const points = await PickupPoint.findAll({
        where: { startLocationId: parseInt(startLocationId) },
        order: [['name', 'ASC']],
      });
      return points;
    } catch (e) {
      console.error('[getPickupPointsByStartLocation]', e);
      throw new InternalServerError('Failed to fetch pickup points');
    }
  },

  createPickupPoint: async (data) => {
    const { name, startLocationId } = data;
    if (!name || !name.trim()) throw new BadRequest('Pickup point name is required');
    if (!startLocationId)      throw new BadRequest('startLocationId is required');
    try {
      const startLoc = await StartLocation.findByPk(startLocationId);
      if (!startLoc) throw new NotFound('Start location not found');

      const point = await PickupPoint.create({
        name:            name.trim(),
        startLocationId: parseInt(startLocationId),
        status:          1,
      });
      return point;
    } catch (e) {
      if (e.status) throw e;
      console.error('[createPickupPoint]', e);
      throw new InternalServerError('Failed to create pickup point');
    }
  },

  updatePickupPoint: async (id, data) => {
    const { name } = data;
    if (!name || !name.trim()) throw new BadRequest('Name is required');
    try {
      const point = await PickupPoint.findByPk(id);
      if (!point) throw new NotFound('Pickup point not found');
      await point.update({ name: name.trim() });
      return point;
    } catch (e) {
      if (e.status) throw e;
      console.error('[updatePickupPoint]', e);
      throw new InternalServerError('Failed to update pickup point');
    }
  },

  deletePickupPoint: async (id) => {
    try {
      const point = await PickupPoint.findByPk(id);
      if (!point) throw new NotFound('Pickup point not found');
      await point.destroy();
      return { message: 'Pickup point deleted successfully' };
    } catch (e) {
      if (e.status) throw e;
      console.error('[deletePickupPoint]', e);
      throw new InternalServerError('Failed to delete pickup point');
    }
  },

  // ── DROP POINTS ────────────────────────────────────────────────────────────

  getDropPointsByEndLocation: async (endLocationId) => {
    try {
      const points = await DropPoint.findAll({
        where: { endLocationId: parseInt(endLocationId) },
        order: [['name', 'ASC']],
      });
      return points;
    } catch (e) {
      console.error('[getDropPointsByEndLocation]', e);
      throw new InternalServerError('Failed to fetch drop points');
    }
  },

  createDropPoint: async (data) => {
    const { name, endLocationId } = data;
    if (!name || !name.trim()) throw new BadRequest('Drop point name is required');
    if (!endLocationId)        throw new BadRequest('endLocationId is required');
    try {
      const endLoc = await EndLocation.findByPk(endLocationId);
      if (!endLoc) throw new NotFound('End location not found');

      const point = await DropPoint.create({
        name:          name.trim(),
        endLocationId: parseInt(endLocationId),
      });
      return point;
    } catch (e) {
      if (e.status) throw e;
      console.error('[createDropPoint]', e);
      throw new InternalServerError('Failed to create drop point');
    }
  },

  updateDropPoint: async (id, data) => {
    const { name } = data;
    if (!name || !name.trim()) throw new BadRequest('Name is required');
    try {
      const point = await DropPoint.findByPk(id);
      if (!point) throw new NotFound('Drop point not found');
      await point.update({ name: name.trim() });
      return point;
    } catch (e) {
      if (e.status) throw e;
      console.error('[updateDropPoint]', e);
      throw new InternalServerError('Failed to delete drop point');
    }
  },

  deleteDropPoint: async (id) => {
    try {
      const point = await DropPoint.findByPk(id);
      if (!point) throw new NotFound('Drop point not found');
      await point.destroy();
      return { message: 'Drop point deleted successfully' };
    } catch (e) {
      if (e.status) throw e;
      console.error('[deleteDropPoint]', e);
      throw new InternalServerError('Failed to delete drop point');
    }
  },
  // In locationService.js, add this function inside the locationService object:

getEndLocationsByStartLocation: async (startLocationId) => {
  try {
    const locations = await EndLocation.findAll({
      where:  { startLocationId: parseInt(startLocationId) },
      order:  [['name', 'ASC']],
    });
    return locations;
  } catch (e) {
    console.error('[getEndLocationsByStartLocation]', e);
    throw new InternalServerError('Failed to fetch end locations');
  }
},
};

module.exports = locationService;


// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — add these to your Express router (e.g. routes/locationRoutes.js)
// ─────────────────────────────────────────────────────────────────────────────
//
// GET    /locations/start                     → getAllStartLocations
// POST   /locations/start                     → createStartLocation
// PUT    /locations/start/:id                 → updateStartLocation
// DELETE /locations/start/:id                 → deleteStartLocation
//
// GET    /locations/end                       → getAllEndLocations
// POST   /locations/end                       → createEndLocation
// PUT    /locations/end/:id                   → updateEndLocation
// DELETE /locations/end/:id                   → deleteEndLocation
//
// GET    /locations/start/:id/pickup          → getPickupPointsByStartLocation
// POST   /locations/pickup                    → createPickupPoint
// PUT    /locations/pickup/:id                → updatePickupPoint
// DELETE /locations/pickup/:id               → deletePickupPoint
//
// GET    /locations/end/:id/drop              → getDropPointsByEndLocation
// POST   /locations/drop                      → createDropPoint
// PUT    /locations/drop/:id                  → updateDropPoint
// DELETE /locations/drop/:id                 → deleteDropPoint