const express = require('express');
const carController = require('../controllers/carController');

const router = express.Router();

// 👉 Create a new car
router.post("/create", carController.createCar);

// 👉 Get all cars
router.get("/list", carController.getAllCars);

// 👉 Get a car by ID
router.get("/details/:id", carController.getCarById);

// 👉 Update a car by ID
router.put("/update/:id", carController.updateCar);

// 👉 Delete a car by ID
router.delete("/delete/:id", carController.deleteCar);



module.exports = router;
