const { StartLocation, PickupPoint, EndLocation, DropPoint, Route } = require('../db/models');
const { Op } = require('sequelize');

const locationService = {
  // --- Admin Functions ---

  createStartLocation: async (data) => {
    return StartLocation.create(data);
  },

  createPickupPoint: async (data) => {
    return PickupPoint.create(data);
  },

  createEndLocation: async (data) => {
    return EndLocation.create(data);
  },

  createDropPoint: async (data) => {
    return DropPoint.create(data);
  },

  createRoute: async (data) => {
    return Route.create(data);
  },

  getAllRoutes: async () => {
    return await Route.findAll({
      include: [
        { model: StartLocation, as: 'StartLocation', attributes: ['id', 'name'] },
        { model: EndLocation, as: 'EndLocation', attributes: ['id', 'name'] },
      ]
    });
  },

  updateRoute: async (id, data) => {
    const route = await Route.findByPk(id);
    if (!route) {
      throw new Error('Route not found');
    }
    await route.update(data);
    return route;
  },

  deleteRoute: async (id) => {
    const route = await Route.findByPk(id);
    if (!route) {
      throw new Error('Route not found');
    }
    await route.destroy();
    return true;
  },

  getAllStartLocations: async () => {
    return StartLocation.findAll({
      attributes: ['id', 'name'],
      where: { status: true },
      order: [['name', 'ASC']],
    });
  },

  getAllPickupPoints: async () => {
    return PickupPoint.findAll({
      attributes: ['id', 'name'],
      where: { status: true },
      order: [['name', 'ASC']],
    });
  },

  getAllEndLocations: async () => {
    return EndLocation.findAll({
      attributes: ['id', 'name'],
      where: { status: true },
      order: [['name', 'ASC']],
    });
  },

  getAllDropPoints: async () => {
    return DropPoint.findAll({
      attributes: ['id', 'name'],
      where: { status: true },
      order: [['name', 'ASC']],
    });
  },

  // --- User-Facing Functions ---

  getLocationInfo: async ({ startLocationId, endLocationId, pickupPointId, dropPointId }) => {
    const result = {};

    if (startLocationId) {
      const startLocation = await StartLocation.findByPk(startLocationId, { attributes: ['id', 'name'] });
      if (startLocation) result.startLocation = startLocation;
    }

    if (endLocationId) {
      const endLocation = await EndLocation.findByPk(endLocationId, { attributes: ['id', 'name'] });
      if (endLocation) result.endLocation = endLocation;
    }

    if (pickupPointId) {
      const pickupPoint = await PickupPoint.findByPk(pickupPointId, { attributes: ['id', 'name'] });
      if (pickupPoint) result.pickupPoint = pickupPoint;
    }

    if (dropPointId) {
      const dropPoint = await DropPoint.findByPk(dropPointId, { attributes: ['id', 'name'] });
      if (dropPoint) result.dropPoint = dropPoint;
    }

    return result;
  },

  getPickupPointsByStartLocation: async (startLocationId) => {
    return PickupPoint.findAll({
      attributes: ['id', 'name'],
      where: { startLocationId, status: true },
      order: [['name', 'ASC']],
    });
  },

  getEndLocationsByStartLocation: async (startLocationId) => {
    return EndLocation.findAll({
      attributes: ['id', 'name'],
      where: { startLocationId, status: true },
      order: [['name', 'ASC']],
    });
  },

  getDropPointsByEndLocation: async (endLocationId) => {
    return DropPoint.findAll({
      attributes: ['id', 'name'],
      where: { endLocationId, status: true },
      order: [['name', 'ASC']],
    });
  },

  getHierarchicalLocations: async () => {
    const startLocations = await StartLocation.findAll({
      attributes: ['id', 'name'],
      where: { status: true },
      include: [
        {
          model: PickupPoint,
          attributes: ['id', 'name'],
          where: { status: true },
          required: false,
        },
        {
          model: EndLocation,
          attributes: ['id', 'name'],
          where: { status: true },
          required: false,
          include: [
            {
              model: DropPoint,
              attributes: ['id', 'name'],
              where: { status: true },
              required: false,
            },
          ],
        },
      ],
      order: [['name', 'ASC']],
    });

    return startLocations.map(startLocation => ({
      startLocation: startLocation.name,
      pickupPoints: startLocation.PickupPoints.map(pp => pp.name),
      endLocations: startLocation.EndLocations.map(el => ({
        name: el.name,
        dropPoints: el.DropPoints.map(dp => dp.name),
      })),
    }));
  },

  updateStartLocation: async (id,update) => {
    const startLocation = await StartLocation.findByPk(id);
    if (!startLocation) {
      throw new Error('Start location not found');
    }
    await startLocation.update({name: update.name});
    return { message: 'Start location updated successfully' };
  },

  updatePickupPoint: async (id,update) => {
    const pickupPoint = await PickupPoint.findByPk(id);
    if (!pickupPoint) {
      throw new Error('Pickup point not found');
    }
    await pickupPoint.update({name: update.name});
    return { message: 'Pickup point updated successfully' };
  },

  updateEndLocation: async (id,update) => {
    const endLocation = await EndLocation.findByPk(id);
    if (!endLocation) {
      throw new Error('End location not found');
    }
    await endLocation.update({name: update.name});
    return { message: 'End location updated successfully' };
  },

  updateDropPoint: async (id,update) => {
    const dropPoint = await DropPoint.findByPk(id);
    if (!dropPoint) {
      throw new Error('Drop point not found');
    }
    await dropPoint.update({name: update.name});
    return { message: 'Drop point updated successfully' };
  },

  deleteStartLocation: async (id) => {
    const startLocation = await StartLocation.findByPk(id);
    if (!startLocation) {
      throw new Error('Start location not found');
    }
    await startLocation.destroy();
    return { message: 'Start location deleted successfully' };
  },

  deletePickupPoint: async (id) => {
    const pickupPoint = await PickupPoint.findByPk(id);
    if (!pickupPoint) {
      throw new Error('Pickup point not found');
    }
    await pickupPoint.destroy();
    return { message: 'Pickup point deleted successfully' };
  },

  deleteEndLocation: async (id) => {
    const endLocation = await EndLocation.findByPk(id);
    if (!endLocation) {
      throw new Error('End location not found');
    }
    await endLocation.destroy();
    return { message: 'End location deleted successfully' };
  },

  deleteDropPoint: async (id) => {
    const dropPoint = await DropPoint.findByPk(id);
    if (!dropPoint) {
      throw new Error('Drop point not found');
    }
    await dropPoint.destroy();
    return { message: 'Drop point deleted successfully' };
  },
}

module.exports = locationService;
