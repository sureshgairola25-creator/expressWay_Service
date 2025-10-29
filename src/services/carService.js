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

    return Car.create(data);
  },

  getAllCars: async (query = {}) => {
    const { class: carClass, ...otherFilters } = query;
    
    const where = { ...otherFilters };
    
    if (carClass) {
      where.class = carClass;
    }
    
    return Car.findAll({
      where,
      order: [['created_at', 'DESC']]
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
          id: { [Op.ne]: id } // Exclude current car
        }
      });

      if (existingCar) {
        throw new BadRequest('A car with this unique number already exists');
      }
    }
    
    return car.update(data);
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
  }
};

module.exports = carService;
