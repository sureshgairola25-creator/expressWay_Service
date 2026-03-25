const tripService = require('../services/tripService');
const asyncHandler = require('../../middleware/async');
const { BadRequestError } = require('../utils/errors');

const tripController = {
  createTrip: asyncHandler(async (req, res) => {
    const { seats, meals = [], ...tripData } = req.body;

    // Validate required fields
    const requiredFields = [
      'startLocationId', 'endLocationId', 'carId',
      'startTime', 'endTime'
    ];

    const missingFields = requiredFields.filter(field => !tripData[field]);
    if (missingFields.length > 0) {
      throw new BadRequestError(`Missing required fields: ${missingFields.join(', ')}`);
    }

    // Validate seats — price is NO LONGER required here, it comes from the car
    if (!seats || !Array.isArray(seats) || seats.length === 0) {
      throw new BadRequestError('At least one seat is required');
    }

    // Only validate seatNumber and seatType — price comes from car
    for (const [i, seat] of seats.entries()) {
      if (!seat.seatNumber) {
        throw new BadRequestError(`Seat at index ${i} is missing seatNumber`);
      }
      if (!seat.seatType) {
        throw new BadRequestError(`Seat at index ${i} is missing seatType`);
      }
    }

    // Validate startTime and endTime
    const startTime = new Date(tripData.startTime);
    const endTime = new Date(tripData.endTime);

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      throw new BadRequestError('Invalid date format for startTime or endTime');
    }

    if (startTime >= endTime) {
      throw new BadRequestError('endTime must be after startTime');
    }

    // Create trip — price will be derived from car inside the service
    const trip = await tripService.createTripWithSeats(tripData, seats, meals);

    res.status(201).json({
      success: true,
      data: trip
    });
  }),

  getAllTrips: asyncHandler(async (req, res) => {
    const trips = await tripService.getAllTrips(req.query);
    res.status(200).json({
      success: true,
      count: trips.length,
      data: trips
    });
  }),

  getTripById: asyncHandler(async (req, res) => {
    const trip = await tripService.getTripById(req.params.id);
    res.status(200).json({ success: true, data: trip });
  }),

  updateTrip: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updateData = { ...req.body };

    // If updating times, validate them
    if (updateData.startTime || updateData.endTime) {
      const currentTrip = await tripService.getTripById(id);
      const startTime = new Date(updateData.startTime || currentTrip.startTime);
      const endTime = new Date(updateData.endTime || currentTrip.endTime);

      if (startTime >= endTime) {
        throw new BadRequestError('endTime must be after startTime');
      }
    }

    const trip = await tripService.updateTrip(id, updateData);
    const updatedTrip = await tripService.getTripById(id);

    res.status(200).json({
      success: true,
    data: updatedTrip
    });
  }),

  deleteTrip: asyncHandler(async (req, res) => {
    const result = await tripService.deleteTrip(req.params.id);
    res.status(200).json({ success: true, data: result });
  }),

  searchTrips: asyncHandler(async (req, res) => {
    const trips = await tripService.searchTrips(req.query);
    res.status(200).json({ success: true, data: trips });
  }),
   searchPersonalizeTrips: asyncHandler(async (req, res) => {
    const result = await tripService.searchPersonalizeTrips(req.query);
 
    if (result && result.error) {
      return res.status(400).json({ success: false, message: result.message });
    }
 
    res.status(200).json({ success: true, data: result });
  }),

  getTripSeats: asyncHandler(async (req, res) => {
    const { tripId } = req.params;
    const { journeyDate } = req.query;

    if (journeyDate && !/^\d{4}-\d{2}-\d{2}$/.test(journeyDate)) {
      throw new Error('Invalid journeyDate format. Please use YYYY-MM-DD format.');
    }

    const seats = await tripService.getSeatsForTrip(tripId, journeyDate);
    res.status(200).json({ success: true, data: seats });
  }),
};

module.exports = tripController;
// const tripService = require('../services/tripService');
// const asyncHandler = require('../../middleware/async');

// const { BadRequestError } = require('../utils/errors');

// const tripController = {
//   createTrip: asyncHandler(async (req, res) => {
//     const { seats, meals = [], ...tripData } = req.body;

//     // Validate required fields
//     const requiredFields = [
//       'startLocationId', 'endLocationId', 'carId', 
//       'startTime', 'endTime'
//     ];
    
//     const missingFields = requiredFields.filter(field => !tripData[field]);
//     if (missingFields.length > 0) {
//       throw new BadRequestError(`Missing required fields: ${missingFields.join(', ')}`);
//     }

//     // Validate seats
//     if (!seats || !Array.isArray(seats) || seats.length === 0) {
//       throw new BadRequestError('At least one seat is required');
//     }

//     // Validate startTime and endTime
//     const startTime = new Date(tripData.startTime);
//     const endTime = new Date(tripData.endTime);
    
//     if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
//       throw new BadRequestError('Invalid date format for startTime or endTime');
//     }
    
//     if (startTime >= endTime) {
//       throw new BadRequestError('endTime must be after startTime');
//     }

//     // Create trip with seats and meals
//     const trip = await tripService.createTripWithSeats(tripData, seats, meals);
    
//     // Get the full trip details with all associations
//     // const tripWithDetails = await tripService.getTripById(trip.id);
    
//     res.status(201).json({ 
//       success: true, 
//       data: trip 
//     });
//   }),

//   getAllTrips: asyncHandler(async (req, res) => {
//     const trips = await tripService.getAllTrips(req.query);
//     res.status(200).json({ 
//       success: true, 
//       count: trips.length,
//       data: trips 
//     });
//   }),

//   getTripById: asyncHandler(async (req, res) => {
//     const trip = await tripService.getTripById(req.params.id);
//     res.status(200).json({ success: true, data: trip });
//   }),

//   updateTrip: asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const updateData = { ...req.body };
    
//     // If updating times, validate them
//     if (updateData.startTime || updateData.endTime) {
//       const currentTrip = await tripService.getTripById(id);
//       const startTime = new Date(updateData.startTime || currentTrip.startTime);
//       const endTime = new Date(updateData.endTime || currentTrip.endTime);
      
//       if (startTime >= endTime) {
//         throw new BadRequestError('endTime must be after startTime');
//       }
//     }
    
//     const trip = await tripService.updateTrip(id, updateData);
//     const updatedTrip = await tripService.getTripById(id);
    
//     res.status(200).json({ 
//       success: true, 
//       data: updatedTrip 
//     });
//   }),

//   deleteTrip: asyncHandler(async (req, res) => {
//     const result = await tripService.deleteTrip(req.params.id);
//     res.status(200).json({ success: true, data: result });
//   }),

//   searchTrips: asyncHandler(async (req, res) => {
//     const trips = await tripService.searchTrips(req.query);
//     res.status(200).json({ success: true, data: trips });
//   }),

//   getTripSeats: asyncHandler(async (req, res) => {
//     const { tripId } = req.params;
//     const { journeyDate } = req.query;
    
//     // Validate journeyDate format if provided
//     if (journeyDate && !/^\d{4}-\d{2}-\d{2}$/.test(journeyDate)) {
//       throw new Error('Invalid journeyDate format. Please use YYYY-MM-DD format.');
//     }
    
//     const seats = await tripService.getSeatsForTrip(tripId, journeyDate);
//     res.status(200).json({ success: true, data: seats });
//   }),
// };

// module.exports = tripController;
