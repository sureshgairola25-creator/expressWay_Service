const express = require('express');
const tripController = require('../controllers/tripController');

const router = express.Router();

// 👉 Search for trips (sharing + cabin)
router.get("/search", tripController.searchTrips);

// 👉 Calculate price for a trip based on bookingMode and seatCount
// GET /api/trips/calculate-price?tripId=1&bookingMode=seat&seatCount=2
// GET /api/trips/calculate-price?tripId=1&bookingMode=cabin
router.get("/calculate-price", tripController.calculatePrice);

// 👉 Search for personalize trips
router.get("/search-personalize", tripController.searchPersonalizeTrips);

// 👉 Get available departure times for a route + ride_type (clock-selector support)
// GET /api/trips/departure-times?startLocation=1&endLocation=2&ride_type=sharing&date=2026-04-03
router.get("/departure-times", tripController.getDepartureTimes);

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



router.put("/update-group/:tripGroupId", tripController.updateTripGroup);

router.delete("/delete-group/:tripGroupId", tripController.deleteTripGroup);

module.exports = router;
