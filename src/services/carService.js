const { Car, Trip } = require('../db/models');
const { NotFound, BadRequest } = require('http-errors');
const { Op } = require('sequelize');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: derive backward-compat fields from bookingMode
//
// When bookingMode is set we auto-populate:
//   cabType        — keeps legacy tripService / bookingService filters working
//   availableModes — keeps getCarModes() in tripService working
//
// This means NO changes are required in tripService or bookingService for
// existing ride-type filtering and pricing logic.
// ─────────────────────────────────────────────────────────────────────────────
function applyBookingModeDefaults(data) {
  const mode = data.bookingMode;
  if (!mode) return data;

  if (mode === 'sharing_and_cabin') {
    return {
      ...data,
      cabType:        'sharing',             // default cabType for broad DB filters
      availableModes: ['sharing', 'cabin'],  // enables both ride_type tabs
    };
  }

  if (mode === 'personalized') {
    return {
      ...data,
      cabType:        'personalize',
      availableModes: null,
    };
  }

  return data;
}

const carService = {
  // ── Create Car ─────────────────────────────────────────────────────────────
  createCar: async (data) => {
    const existingCar = await Car.findOne({ where: { carUniqueNumber: data.carUniqueNumber } });
    if (existingCar) throw new BadRequest('A car with this unique number already exists');

    if (!data.class) data.class = 'standard';

    // bookingMode takes priority; fall back to legacy cabType
    const withDefaults = applyBookingModeDefaults(data);

    // Legacy fallback: if neither bookingMode nor cabType provided, default to sharing
    if (!withDefaults.cabType) withDefaults.cabType = 'sharing';

    // Never persist totalCabins — cabins are always derived from seats
    delete withDefaults.totalCabins;

    const sanitized = carService.sanitizePricing(withDefaults);
    carService.validatePricing(sanitized);

    return Car.create(sanitized);
  },

  // ── Get All Cars ───────────────────────────────────────────────────────────
  getAllCars: async (query = {}) => {
    const { class: carClass, cabType, page = 1, limit = 10, ...otherFilters } = query;
    const where = { ...otherFilters };

    if (carClass) where.class = carClass;

    if (cabType) {
      const types = cabType.split(',').map(t => t.trim());
      where.cabType = types.length > 1 ? { [Op.in]: types } : types[0];
    }

    const parsedPage  = parseInt(page,  10);
    const parsedLimit = parseInt(limit, 10);
    const offset      = (parsedPage - 1) * parsedLimit;

    const { count, rows } = await Car.findAndCountAll({
      where,
      order: [['created_at', 'ASC']],
      limit: parsedLimit,
      offset,
    });

    return {
      data: rows,
      pagination: {
        total:      count,
        page:       parsedPage,
        limit:      parsedLimit,
        totalPages: Math.ceil(count / parsedLimit),
      },
    };
  },

  // ── Get Car By ID ──────────────────────────────────────────────────────────
  getCarById: async (id) => {
    const car = await Car.findByPk(id);
    if (!car) throw new NotFound('Car not found');
    return car;
  },

  // ── Update Car ─────────────────────────────────────────────────────────────
  updateCar: async (id, data) => {
    const car = await carService.getCarById(id);

    if (data.carUniqueNumber && data.carUniqueNumber !== car.carUniqueNumber) {
      const dup = await Car.findOne({
        where: { carUniqueNumber: data.carUniqueNumber, id: { [Op.ne]: id } }
      });
      if (dup) throw new BadRequest('A car with this unique number already exists');
    }

    const withDefaults = applyBookingModeDefaults(data);

    // Never persist totalCabins
    delete withDefaults.totalCabins;

    const sanitized = carService.sanitizePricing(withDefaults);

    // Only re-validate pricing if booking mode or cab type is being updated
    if (sanitized.bookingMode || sanitized.cabType) {
      carService.validatePricing({ ...car.toJSON(), ...sanitized });
    }

    return car.update(sanitized);
  },

  // ── Delete Car ─────────────────────────────────────────────────────────────
  // Prevents deletion if any trips reference this car.
  deleteCar: async (id) => {
    const car = await carService.getCarById(id);

    const tripCount = await Trip.count({ where: { carId: id } });
    if (tripCount > 0) {
      throw new BadRequest(
        `Cannot delete this car — it is assigned to ${tripCount} trip(s). ` +
        'Remove or reassign those trips first.'
      );
    }

    await car.destroy();
    return { message: 'Car deleted successfully' };
  },

  // ── Get Car By Unique Number ───────────────────────────────────────────────
  getCarByUniqueNumber: async (carUniqueNumber) => {
    const car = await Car.findOne({ where: { carUniqueNumber } });
    if (!car) throw new NotFound('Car not found with the provided unique number');
    return car;
  },

  // ── Sanitize Pricing ───────────────────────────────────────────────────────
  // Convert empty strings to null before writing to DB.
  sanitizePricing: (data) => ({
    ...data,
    pricePerSeat:  data.pricePerSeat  === '' ? null : data.pricePerSeat,
    pricePerCabin: data.pricePerCabin === '' ? null : data.pricePerCabin,
    cabinCapacity: data.cabinCapacity === '' ? null : data.cabinCapacity,
    pricePerCar:   data.pricePerCar   === '' ? null : data.pricePerCar,
  }),

  // ── Validate Pricing ───────────────────────────────────────────────────────
  // Handles both new bookingMode and legacy cabType for backward compat.
  validatePricing: (data) => {
    const {
      bookingMode, cabType,
      totalSeats, cabinCapacity,
      pricePerSeat, pricePerCabin, pricePerCar,
    } = data;

    // ── New booking model ─────────────────────────────────────────────────
    if (bookingMode === 'sharing_and_cabin') {
      if (!totalSeats || Number(totalSeats) <= 0)
        throw new BadRequest('Total seats is required for sharing & cabin mode');
      if (!cabinCapacity || Number(cabinCapacity) <= 0)
        throw new BadRequest('Seats per cabin is required for sharing & cabin mode');
      if (Number(totalSeats) < Number(cabinCapacity))
        throw new BadRequest('Total seats must be greater than or equal to seats per cabin');
      if (!pricePerSeat || Number(pricePerSeat) <= 0)
        throw new BadRequest('Price per seat is required for sharing & cabin mode');
      if (!pricePerCabin || Number(pricePerCabin) <= 0)
        throw new BadRequest('Price per cabin is required for sharing & cabin mode');
      return;
    }

    if (bookingMode === 'personalized') {
      if (!pricePerCar || Number(pricePerCar) <= 0)
        throw new BadRequest('Price per car is required for personalized mode');
      return;
    }

    // ── Legacy cabType fallback (existing cars without bookingMode) ────────
    if (cabType === 'sharing') {
      if (!pricePerSeat || Number(pricePerSeat) <= 0)
        throw new BadRequest('Price per seat is required for sharing cab');
    }
    if (cabType === 'cabin') {
      if (!pricePerCabin || Number(pricePerCabin) <= 0)
        throw new BadRequest('Price per cabin is required for cabin cab');
      if (!cabinCapacity || Number(cabinCapacity) <= 0)
        throw new BadRequest('Cabin capacity is required for cabin cab');
    }
    if (cabType === 'personalize') {
      if (!pricePerCar || Number(pricePerCar) <= 0)
        throw new BadRequest('Price per car is required for personalize cab');
    }
  },
};

module.exports = carService;
