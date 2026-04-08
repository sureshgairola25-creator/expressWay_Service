const { NotFound, BadRequest, InternalServerError } = require('http-errors');
const db = require('../db/models');
const { Op } = require('sequelize');
const { StartLocation, EndLocation, PickupPoint, DropPoint } = db;

// ── Uniqueness scope helpers ───────────────────────────────────────────────────
// Sharing and Cabin share the 'shared' namespace.
// Personalized is its own namespace.
// 'all' conflicts with BOTH namespaces.
//
// Returns the locationType values that would conflict with the given locationType,
// so we can do: WHERE name = ? AND locationType IN (conflicting)
const ltConflicts = (lt) => {
  if (lt === 'personalized') return ['personalized', 'all'];
  if (lt === 'all')          return ['shared', 'personalized', 'all'];
  return ['shared', 'all'];                       // 'shared' → sharing + cabin
};

// PickupPoint / DropPoint use cabType values: 'sharing', 'cabin', 'personalize', 'all'
// Sharing and Cabin are still the same namespace.
const ctConflicts = (ct) => {
  if (ct === 'personalize') return ['personalize', 'all'];
  if (ct === 'all')         return ['sharing', 'cabin', 'personalize', 'all'];
  return ['sharing', 'cabin', 'all'];             // 'sharing' or 'cabin'
};

const locationService = {

  // ── START LOCATIONS ────────────────────────────────────────────────────────

  // Sharing + Cabin rides — only 'shared' and 'all'
  getAllStartLocations: async () => {
    return StartLocation.findAll({
      where: { location_type: { [Op.in]: ['shared', 'all'] } },
      order: [['name', 'ASC']],
    });
  },

  // Personalized rides — only 'personalized' and 'all'
  getPersonalizeStartLocations: async () => {
    return StartLocation.findAll({
      where: { location_type: { [Op.in]: ['personalized', 'all'] } },
      order: [['name', 'ASC']],
    });
  },

  // Admin — fetch ALL start locations regardless of type (for Route Management)
  getAllStartLocationsAdmin: async () => {
    return StartLocation.findAll({ order: [['name', 'ASC']] });
  },

  createStartLocation: async (data) => {
    const { name, location_type } = data;
    if (!name?.trim()) throw new BadRequest('Start location name is required');
    try {
      const lt = location_type || 'shared';
      // Only conflict within the same namespace — 'shared' and 'personalized' are separate
      const existing = await StartLocation.findOne({
        where: { name: name.trim(), locationType: { [Op.in]: ltConflicts(lt) } }
      });
      if (existing) throw new BadRequest(
        `Start location "${name}" already exists for ${lt === 'personalized' ? 'personalized' : 'sharing/cabin'} trips`
      );
      return await StartLocation.create({ name: name.trim(), locationType: lt });
    } catch (e) {
      if (e.status) throw e;
      throw new InternalServerError('Failed to create start location');
    }
  },

  updateStartLocation: async (id, data) => {
    const { name, location_type } = data;
    if (!name?.trim()) throw new BadRequest('Name is required');
    try {
      const location = await StartLocation.findByPk(id);
      if (!location) throw new NotFound('Start location not found');
      const lt = location_type || location.locationType || 'shared';
      // Ensure renamed value doesn't clash within the same namespace (exclude self)
      const conflict = await StartLocation.findOne({
        where: {
          name:         name.trim(),
          locationType: { [Op.in]: ltConflicts(lt) },
          id:           { [Op.ne]: parseInt(id) },
        }
      });
      if (conflict) throw new BadRequest(
        `Start location "${name}" already exists for ${lt === 'personalized' ? 'personalized' : 'sharing/cabin'} trips`
      );
      await location.update({ name: name.trim(), ...(location_type && { locationType: location_type }) });
      return location;
    } catch (e) {
      if (e.status) throw e;
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
      throw new InternalServerError('Failed to delete start location');
    }
  },

  // ── END LOCATIONS ──────────────────────────────────────────────────────────

  // Sharing + Cabin — filtered by startLocationId, only shared/all
  getEndLocationsByStartLocation: async (startLocationId) => {
    try {
      const locations = await EndLocation.findAll({
        where: {
          startLocationId: parseInt(startLocationId),
          location_type:   { [Op.in]: ['shared', 'all'] },
        },
        order: [['name', 'ASC']],
      });
      return locations;
    } catch (e) {
      throw new InternalServerError('Failed to fetch end locations');
    }
  },

  // Personalized — filtered by startLocationId, only personalized/all
  getPersonalizeEndLocations: async (startLocationId) => {
    const where = { location_type: { [Op.in]: ['personalized', 'all'] } };
    if (startLocationId) where.startLocationId = parseInt(startLocationId);
    return EndLocation.findAll({ where, order: [['name', 'ASC']] });
  },

  getAllEndLocations: async () => {
    try {
      return await EndLocation.findAll({ order: [['name', 'ASC']] });
    } catch (e) {
      throw new InternalServerError('Failed to fetch end locations');
    }
  },

  createEndLocation: async (data) => {
    const { name, startLocationId, location_type } = data;
    if (!name?.trim())    throw new BadRequest('End location name is required');
    if (!startLocationId) throw new BadRequest('startLocationId is required');
    try {
      const startLoc = await StartLocation.findByPk(startLocationId);
      if (!startLoc) throw new NotFound('Start location not found');
      const lt = location_type || 'shared';
      // Scoped by route (startLocationId) + namespace
      const existing = await EndLocation.findOne({
        where: {
          name:            name.trim(),
          startLocationId: parseInt(startLocationId),
          locationType:    { [Op.in]: ltConflicts(lt) },
        }
      });
      if (existing) throw new BadRequest(
        `End location "${name}" already exists on this route for ${lt === 'personalized' ? 'personalized' : 'sharing/cabin'} trips`
      );
      return await EndLocation.create({
        name:            name.trim(),
        startLocationId: parseInt(startLocationId),
        locationType:    lt,
      });
    } catch (e) {
      if (e.status) throw e;
      throw new InternalServerError('Failed to create end location');
    }
  },

  updateEndLocation: async (id, data) => {
    const { name, location_type } = data;
    if (!name?.trim()) throw new BadRequest('Name is required');
    try {
      const location = await EndLocation.findByPk(id);
      if (!location) throw new NotFound('End location not found');
      const lt = location_type || location.locationType || 'shared';
      const conflict = await EndLocation.findOne({
        where: {
          name:            name.trim(),
          startLocationId: location.startLocationId,
          locationType:    { [Op.in]: ltConflicts(lt) },
          id:              { [Op.ne]: parseInt(id) },
        }
      });
      if (conflict) throw new BadRequest(
        `End location "${name}" already exists on this route for ${lt === 'personalized' ? 'personalized' : 'sharing/cabin'} trips`
      );
      await location.update({ name: name.trim(), ...(location_type && { locationType: location_type }) });
      return location;
    } catch (e) {
      if (e.status) throw e;
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
      throw new InternalServerError('Failed to delete end location');
    }
  },

  // ── LOCATION INFO (for header display in AvailableCab) ────────────────────

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
      throw new InternalServerError('Failed to fetch location info');
    }
  },

  // ── PICKUP POINTS ──────────────────────────────────────────────────────────

  getPickupPointsByStartLocation: async (startLocationId) => {
    try {
      return await PickupPoint.findAll({
        where: { startLocationId: parseInt(startLocationId) },
        order: [['name', 'ASC']],
      });
    } catch (e) {
      throw new InternalServerError('Failed to fetch pickup points');
    }
  },

  createPickupPoint: async (data) => {
    const {
      name, startLocationId,
      price         = null,
      type          = 'standard',
      description   = null,
      meta          = null,
      isCityDefault = false,
      cityDefaultFor = null,
      cabType       = 'all',
      status        = 1,
      endLocationId
    } = data;

    if (!name?.trim())    throw new BadRequest('Pickup point name is required');
    if (!startLocationId) throw new BadRequest('startLocationId is required');

    try {
      const startLoc = await StartLocation.findByPk(startLocationId);
      if (!startLoc) throw new NotFound('Start location not found');

      // Scoped by startLocationId + cabType namespace
      const ct = cabType || 'all';
      const existing = await PickupPoint.findOne({
        where: {
          name:            name.trim(),
          startLocationId: parseInt(startLocationId),
          cabType:         { [Op.in]: ctConflicts(ct) },
        }
      });
      if (existing) throw new BadRequest(
        `Pickup point "${name}" already exists for this start location under ${ct === 'personalize' ? 'personalized' : 'sharing/cabin'} trips`
      );

      const isDefault = isCityDefault === true || isCityDefault === 'true' || isCityDefault === 1;

      const point = await PickupPoint.create({
        name:            name.trim(),
        startLocationId: parseInt(startLocationId),
        endLocationId:   endLocationId ? parseInt(endLocationId) : null,  // ← NEW
        price:           price !== null && price !== undefined && price !== ''
                           ? parseFloat(price) : null,
        type:            type     || 'standard',
        description:     description || null,
        meta:            meta ? (typeof meta === 'string' ? JSON.parse(meta) : meta) : null,
        isCityDefault:   isDefault,
        cityDefaultFor:  isDefault ? (cityDefaultFor || startLoc.city || null) : null,
        cabType:         cabType  || 'all',
        status:          parseInt(status ?? 1),
      });
      return point;
    } catch (e) {
      if (e.status) throw e;
      throw new InternalServerError('Failed to create pickup point');
    }
  },

  updatePickupPoint: async (id, data) => {
    const { name, price, type, description, meta, isCityDefault, cityDefaultFor, cabType, status } = data;
    if (!name?.trim()) throw new BadRequest('Name is required');
    try {
      const point = await PickupPoint.findByPk(id);
      if (!point) throw new NotFound('Pickup point not found');
      await point.update({
        name: name.trim(),
         ...(data.endLocationId !== undefined && {endLocationId: data.endLocationId ? parseInt(data.endLocationId) : null}),
        ...(price         !== undefined && { price: price ? parseFloat(price) : null }),
        ...(type          !== undefined && { type }),
        ...(description   !== undefined && { description }),
        ...(meta          !== undefined && { meta: typeof meta === 'string' ? JSON.parse(meta) : meta }),
        ...(isCityDefault !== undefined && { isCityDefault: isCityDefault === true || isCityDefault === 'true' }),
        ...(cityDefaultFor !== undefined && { cityDefaultFor }),
        ...(cabType       !== undefined && { cabType }),
        ...(status        !== undefined && { status: parseInt(status) }),
      });
      return point;
    } catch (e) {
      if (e.status) throw e;
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
      throw new InternalServerError('Failed to delete pickup point');
    }
  },

  // ── DROP POINTS ────────────────────────────────────────────────────────────

  getDropPointsByEndLocation: async (endLocationId) => {
    try {
      return await DropPoint.findAll({
        where: { endLocationId: parseInt(endLocationId) },
        order: [['name', 'ASC']],
      });
    } catch (e) {
      throw new InternalServerError('Failed to fetch drop points');
    }
  },

  createDropPoint: async (data) => {
    const { name, endLocationId, cabType = 'all' } = data;
    if (!name?.trim())  throw new BadRequest('Drop point name is required');
    if (!endLocationId) throw new BadRequest('endLocationId is required');
    try {
      const endLoc = await EndLocation.findByPk(endLocationId);
      if (!endLoc) throw new NotFound('End location not found');

      // Scoped by endLocationId + cabType namespace
      const ct = cabType || 'all';
      const existing = await DropPoint.findOne({
        where: {
          name:          name.trim(),
          endLocationId: parseInt(endLocationId),
          cabType:       { [Op.in]: ctConflicts(ct) },
        }
      });
      if (existing) throw new BadRequest(
        `Drop point "${name}" already exists for this end location under ${ct === 'personalize' ? 'personalized' : 'sharing/cabin'} trips`
      );

      return await DropPoint.create({
        name:          name.trim(),
        endLocationId: parseInt(endLocationId),
        cabType:       ct,
      });
    } catch (e) {
      if (e.status) throw e;
      throw new InternalServerError('Failed to create drop point');
    }
  },

  updateDropPoint: async (id, data) => {
    const { name } = data;
    if (!name?.trim()) throw new BadRequest('Name is required');
    try {
      const point = await DropPoint.findByPk(id);
      if (!point) throw new NotFound('Drop point not found');
      await point.update({ name: name.trim() });
      return point;
    } catch (e) {
      if (e.status) throw e;
      throw new InternalServerError('Failed to update drop point');
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
      throw new InternalServerError('Failed to delete drop point');
    }
  },
};

module.exports = locationService;

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES REFERENCE — locationRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
//
// Sharing/Cabin (existing — unchanged):
// GET    /locations/start                  → getAllStartLocations       (shared + all)
// GET    /locations/start/:id/end          → getEndLocationsByStartLocation (shared + all)
// GET    /locations/start/:id/pickup       → getPickupPointsByStartLocation
// GET    /locations/end/:id/drop           → getDropPointsByEndLocation
// GET    /locations/info                   → getLocationInfo
//
// Personalized (NEW):
// GET    /locations/personalize/start      → getPersonalizeStartLocations
// GET    /locations/personalize/end        → getPersonalizeEndLocations (?startLocationId=)
//
// Admin (ALL types):
// GET    /locations/admin/start            → getAllStartLocationsAdmin
// POST   /locations/start                  → createStartLocation  (location_type in body)
// PUT    /locations/start/:id              → updateStartLocation
// DELETE /locations/start/:id              → deleteStartLocation
// POST   /locations/end                    → createEndLocation    (location_type in body)
// PUT    /locations/end/:id                → updateEndLocation
// DELETE /locations/end/:id               → deleteEndLocation
// POST   /locations/pickup                 → createPickupPoint
// PUT    /locations/pickup/:id             → updatePickupPoint
// DELETE /locations/pickup/:id            → deletePickupPoint
// POST   /locations/drop                   → createDropPoint
// PUT    /locations/drop/:id               → updateDropPoint
// DELETE /locations/drop/:id              → deleteDropPoint