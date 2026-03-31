const { Car } = require('../db/models');
const { NotFound, BadRequest } = require('http-errors');
const { Op } = require('sequelize');

const carService = {
  createCar: async (data) => {
    // Check if carUniqueNumber already exists
    const existingCar = await Car.findOne({
      where: { carUniqueNumber: data.carUniqueNumber }
    });

    if (existingCar) {
      throw new BadRequest('A car with this unique number already exists');
    }

    // Set default class if not provided
    if (!data.class) {
      data.class = 'standard';
    }
     // Set default cab type if not provided
    if (!data.cabType) {
      data.cabType = 'sharing';
    }
 
    // Sanitize pricing fields — convert empty strings to null
    const sanitizedData = carService.sanitizePricing(data);
 
    // Validate pricing based on cab type
    carService.validatePricing(sanitizedData);
 
    return Car.create(sanitizedData);

  },

  getAllCars: async (query = {}) => {
    const { class: carClass,cabType, ...otherFilters } = query;
    
    const where = { ...otherFilters };
    
    if (carClass) {
      where.class = carClass;
    }
      // Allow filtering by cab type if needed
    if (cabType) {
      // 'sharing,cabin' → filter sharing OR cabin
      const types = cabType.split(',').map(t => t.trim());
      where.cabType = types.length > 1 ? { [Op.in]: types } : types[0];
    }
    
    return Car.findAll({
      where,
      order: [['created_at', 'ASC']]
    });
  },

  getCarById: async (id) => {
    const car = await Car.findByPk(id);
    if (!car) {
      throw new NotFound('Car not found');
    }
    return car;
  },
  updateCar: async (id, data) => {
    const car = await carService.getCarById(id);
 
    // If updating carUniqueNumber, check for duplicates
    if (data.carUniqueNumber && data.carUniqueNumber !== car.carUniqueNumber) {
      const existingCar = await Car.findOne({
        where: {
          carUniqueNumber: data.carUniqueNumber,
          id: { [Op.ne]: id }
        }
      });
 
      if (existingCar) {
        throw new BadRequest('A car with this unique number already exists');
      }
    }
 
    // Sanitize pricing fields — convert empty strings to null
    const sanitizedData = carService.sanitizePricing(data);
 
    // Validate pricing based on cab type
    if (sanitizedData.cabType) {
      carService.validatePricing(sanitizedData);
    }
 
    return car.update(sanitizedData);
  },


  deleteCar: async (id) => {
    const car = await carService.getCarById(id);
    await car.destroy();
    return { message: 'Car deleted successfully' };
  },
  
  getCarByUniqueNumber: async (carUniqueNumber) => {
    const car = await Car.findOne({ where: { carUniqueNumber } });
    if (!car) {
      throw new NotFound('Car not found with the provided unique number');
    }
    return car;
  },

    // Convert empty string pricing fields to null before saving to DB
  sanitizePricing: (data) => {
    return {
      ...data,
      pricePerSeat:  data.pricePerSeat  === '' ? null : data.pricePerSeat,
      pricePerCabin: data.pricePerCabin === '' ? null : data.pricePerCabin,
      cabinCapacity: data.cabinCapacity === '' ? null : data.cabinCapacity,
      totalCabins:   data.totalCabins   === '' ? null : data.totalCabins,
      pricePerCar:   data.pricePerCar   === '' ? null : data.pricePerCar,
    };
  },


    // NEW: Validate pricing fields based on cab type
  validatePricing: (data) => {
    const { cabType, pricePerSeat, pricePerCabin, cabinCapacity, totalCabins, pricePerCar } = data;
 
    if (cabType === 'sharing') {
      if (!pricePerSeat || Number(pricePerSeat) <= 0) {
        throw new BadRequest('Price per seat is required for sharing cab');
      }
    }
 
    if (cabType === 'cabin') {
      if (!pricePerCabin || Number(pricePerCabin) <= 0) {
        throw new BadRequest('Price per cabin is required for cabin cab');
      }
      if (!cabinCapacity || Number(cabinCapacity) <= 0) {
        throw new BadRequest('Cabin capacity is required for cabin cab');
      }
      if (!totalCabins || Number(totalCabins) <= 0) {
        throw new BadRequest('Total cabins is required for cabin cab');
      }
    }
 
    if (cabType === 'personalize') {
      if (!pricePerCar || Number(pricePerCar) <= 0) {
        throw new BadRequest('Price per car is required for personalize cab');
      }
    }
  }

};

module.exports = carService;
