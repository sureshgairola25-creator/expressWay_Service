const express = require('express');
const tripController = require('../controllers/tripController');

const router = express.Router();

// 👉 Search for trips
router.get("/search", tripController.searchTrips);

// 👉 Create a new trip
router.post("/create", tripController.createTrip);

// 👉 Get all trips
router.get("/list", tripController.getAllTrips);

// 👉 Get a single trip by ID
router.get("/details/:id", tripController.getTripById);

// 👉 Get seats for a trip
router.get("/:tripId/seats", tripController.getTripSeats);

// 👉 Update a trip by ID
router.put("/update/:id", tripController.updateTrip);

// 👉 Delete a trip by ID
router.delete("/delete/:id", tripController.deleteTrip);

module.exports = router;
