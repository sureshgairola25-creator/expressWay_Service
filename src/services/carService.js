const { Car } = require('../db/models');
const { NotFound } = require('http-errors');

const carService = {
  createCar: async (data) => {
    return Car.create(data);
  },

  getAllCars: async () => {
    return Car.findAll();
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
    return car.update(data);
  },

  deleteCar: async (id) => {
    const car = await carService.getCarById(id);
    await car.destroy();
    return { message: 'Car deleted successfully' };
  },
};

module.exports = carService;
