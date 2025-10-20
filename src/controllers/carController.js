const carService = require('../services/carService');
const asyncHandler = require('../../middleware/async');

const carController = {
  createCar: asyncHandler(async (req, res) => {
    const car = await carService.createCar(req.body);
    res.status(201).json({ success: true, data: car });
  }),

  getAllCars: asyncHandler(async (req, res) => {
    const cars = await carService.getAllCars();
    res.status(200).json({ success: true, data: cars });
  }),

  getCarById: asyncHandler(async (req, res) => {
    const car = await carService.getCarById(req.params.id);
    res.status(200).json({ success: true, data: car });
  }),

  updateCar: asyncHandler(async (req, res) => {
    const car = await carService.updateCar(req.params.id, req.body);
    res.status(200).json({ success: true, data: car });
  }),

  deleteCar: asyncHandler(async (req, res) => {
    const result = await carService.deleteCar(req.params.id);
    res.status(200).json({ success: true, data: result });
  }),
};

module.exports = carController;
