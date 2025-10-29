const { 
  Trip, 
  Car, 
  Seat, 
  StartLocation, 
  EndLocation, 
  SeatPricing, 
  PickupPoint, 
  DropPoint, 
  BookedSeat, 
  Booking, 
  Meal, 
  sequelize 
} = require('../db/models');
const { Op, Sequelize } = require('sequelize');
const { NotFound } = require('http-errors');
const { BadRequestError, ConflictError } = require('../utils/errors');
const { calculateDuration, toIST, nowIST, toISTString } = require('../utils/dateUtils');

const tripService = {
  createTrip: async (data, options = {}) => {
    // Create a copy of the data to avoid modifying the original
    const tripData = { ...data };
    
    // Convert dates to Date objects if they're strings
    if (tripData.startTime && typeof tripData.startTime === 'string') {
      tripData.startTime = new Date(tripData.startTime);
    }
    if (tripData.endTime && typeof tripData.endTime === 'string') {
      tripData.endTime = new Date(tripData.endTime);
    }
    
    // Calculate duration if both times are provided
    if (tripData.startTime && tripData.endTime) {
      tripData.duration = calculateDuration(tripData.startTime, tripData.endTime);
    }
    
    return await Trip.create(tripData, options);
  },
  findTripByCarAndDate: async (carId, startTime) => {
    // Convert input to Date object if it's a string
    const tripStart = typeof startTime === 'string' ? new Date(startTime) : startTime;
    
    return await Trip.findOne({
      where: {
        carId,
        [Op.or]: [
          // New trip starts during existing trip
          {
            startTime: { [Op.lte]: tripStart },
            endTime: { [Op.gt]: tripStart }
          },
          // New trip ends during existing trip
          {
            startTime: { [Op.lt]: tripStart },
            endTime: { [Op.gte]: tripStart }
          },
          // New trip completely contains existing trip
          {
            startTime: { [Op.gte]: tripStart },
            endTime: { [Op.lte]: tripStart }
          }
        ]
      },
    });
  },

  createTripWithSeats: async (tripData, seats, meals = []) => {
    return await sequelize.transaction(async (transaction) => {
      // Check if trip already exists for same car and date range
      const existingTrip = await tripService.findTripByCarAndDate(
        tripData.carId,
        tripData.startTime
      );
      
      if (existingTrip) {
        throw new ConflictError('A trip already exists for this car during the selected time period');
      }
      
      // Calculate duration
      const duration = calculateDuration(new Date(tripData.startTime), new Date(tripData.endTime));

      // Validate seats
      if (!seats || !Array.isArray(seats) || seats.length === 0) {
        throw new BadRequestError('At least one seat is required');
      }

      // Validate each seat
      seats.forEach((seat, index) => {
        if (!seat.seatNumber || typeof seat.price !== 'number') {
          throw new BadRequestError(`Seat at index ${index} is missing required fields (seatNumber, price)`);
        }
      });

      // Validate meals if they exist
      if (meals && meals.length > 0) {
        meals.forEach((meal, index) => {
          if (!meal.type || typeof meal.price !== 'number') {
            throw new BadRequestError(`Meal at index ${index} is missing required fields (type, price)`);
          }
        });
      }

      // Prepare trip data with calculated duration and meals
      const tripToCreate = {
        ...tripData,
        duration,
        meals: meals.length > 0 ? meals : null
      };

      // Create the trip with meals data
      const trip = await tripService.createTrip(tripToCreate, { transaction });

      // Create seats with tripId
      const seatData = seats.map(seat => ({
        ...seat,
        tripId: trip.id,
        isBooked: false
      }));
      await Seat.bulkCreate(seatData, { transaction });
      return trip;
    });
  },

  getAllTrips: async (query = {}) => {
    const { pickupPoint, dropPoint, date, ...otherFilters } = query;
    const where = { ...otherFilters };
    
    // Add date filter if provided
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      where.startTime = {
        [Op.between]: [startOfDay, endOfDay]
      };
    }
    
    // First, get all distinct trips with basic info
    const trips = await Trip.findAll({
      where,
      include: [
        {
          model: Car,
          attributes: ['id', 'carName', 'carType', 'totalSeats', 'registrationNumber'],
          required: true,
        }
      ],
      attributes: ['id', 'pickupPoints', 'dropPoints', 'startTime', 'endTime', 'duration', 'status'],
      group: ['Trip.id'], // Ensure we get distinct trips
      raw: true,
      nest: true
    });

    // Get all seat data separately to avoid duplicates
    const tripIds = trips.map(trip => trip.id);
    const allSeats = await Seat.findAll({
      where: {
        tripId: { [Op.in]: tripIds }
      },
      attributes: ['id', 'tripId', 'seatNumber', 'seatType', 'price', 'isBooked'],
      raw: true
    });

    // Group seats by tripId
    const seatsByTrip = allSeats.reduce((acc, seat) => {
      if (!acc[seat.tripId]) {
        acc[seat.tripId] = [];
      }
      acc[seat.tripId].push(seat);
      return acc;
    }, {});

    // Process trips in parallel
    const processedTrips = await Promise.all(trips.map(async (trip) => {
      // Get seats for this trip
      const seats = seatsByTrip[trip.id] || [];
      // Parse JSON arrays if they're strings (MySQL might return them as strings)
      const pickupPointIds = Array.isArray(trip.pickupPoints) 
        ? trip.pickupPoints 
        : JSON.parse(trip.pickupPoints || '[]');
      
      const dropPointIds = Array.isArray(trip.dropPoints) 
        ? trip.dropPoints 
        : JSON.parse(trip.dropPoints || '[]');

      // Fetch locations in parallel
      const [pickupPoints, dropPoints] = await Promise.all([
        pickupPointIds.length > 0 ? PickupPoint.findAll({
          where: { 
            id: pickupPointIds,
            status: true
          },
          attributes: ['id', 'name'],
          include: [{
            model: StartLocation,
            attributes: ['id', 'name'],
            required: true
          }],
          raw: true,
          nest: true
        }) : [],
        
        dropPointIds.length > 0 ? DropPoint.findAll({
          where: { 
            id: dropPointIds,
            status: true
          },
          attributes: ['id', 'name'],
          include: [{
            model: EndLocation,
            attributes: ['id', 'name'],
            required: true
          }],
          raw: true,
          nest: true
        }) : []
      ]);

      // Process seats
      const availableSeats = seats.filter(s => !s.isBooked).length;
      const bookedSeats = seats.filter(s => s.isBooked).length;
      const minSeatPrice = seats.length > 0 
        ? Math.min(...seats.map(s => s.price || 0))
        : 0;

      // Apply filters if provided
      if (pickupPoint && !pickupPoints.some(p => p.id == pickupPoint)) {
        return null;
      }
      
      if (dropPoint && !dropPoints.some(p => p.id == dropPoint)) {
        return null;
      }

      return {
        id: trip.id,
        pickupPoints: pickupPoints.map(p => ({
          id: p.id,
          name: p.name,
          type: 'pickup',
          startLocation: p.StartLocation
        })),
        dropPoints: dropPoints.map(d => ({
          id: d.id,
          name: d.name,
          type: 'drop',
          endLocation: d.EndLocation
        })),
        carInfo: trip.Car,
        startTime: trip.startTime,
        endTime: trip.endTime,
        duration: trip.duration,
        status: trip.status,
        availableSeats,
        bookedSeats,
        minSeatPrice,
        seatsInfo: seats
      };
    }));

    // Filter out nulls (from filtering) and return
    return processedTrips.filter(trip => trip !== null);
  },
  

  getTripById: async (id) => {
    // First get the trip with basic info
    const trip = await Trip.findByPk(id, {
      include: [
        {
          model: Car,
          attributes: ['id', 'carName', 'carType', 'totalSeats', 'registrationNumber']
        }
      ],
      attributes: ['id', 'pickupPoints', 'dropPoints', 'startTime', 'endTime', 'duration', 'status', 'meals']
    });

    if (!trip) {
      throw new NotFound('Trip not found');
    }

    // Get seats separately to avoid issues with raw/nested data
    const seats = await Seat.findAll({
      where: { tripId: id },
      attributes: ['id', 'seatNumber', 'seatType', 'price', 'isBooked'],
      raw: true
    });

    // Ensure we have proper arrays for the IDs
    const pickupPointIds = Array.isArray(trip.pickupPoints) 
      ? trip.pickupPoints 
      : (trip.pickupPoints ? JSON.parse(trip.pickupPoints) : []);
    
    const dropPointIds = Array.isArray(trip.dropPoints) 
      ? trip.dropPoints 
      : (trip.dropPoints ? JSON.parse(trip.dropPoints) : []);

    // Fetch locations in parallel
    const [pickupPoints, dropPoints] = await Promise.all([
      pickupPointIds.length > 0 ? PickupPoint.findAll({
        where: { 
          id: pickupPointIds,
          status: true
        },
        attributes: ['id', 'name'],
        include: [{
          model: StartLocation,
          attributes: ['id', 'name'],
          required: true
        }],
        raw: true,
        nest: true
      }) : [],
      
      dropPointIds.length > 0 ? DropPoint.findAll({
        where: { 
          id: dropPointIds,
          status: true
        },
        attributes: ['id', 'name'],
        include: [{
          model: EndLocation,
          attributes: ['id', 'name'],
          required: true
        }],
        raw: true,
        nest: true
      }) : []
    ]);

    // Process seats
    const availableSeats = seats.filter(s => !s.isBooked).length;
    const bookedSeats = seats.filter(s => s.isBooked).length;
    const minSeatPrice = seats.length > 0 
      ? Math.min(...seats.map(s => s.price || 0))
      : 0;

    // Return the complete trip data
    const result = {
      ...trip.get({ plain: true }),
      pickupPoints: pickupPoints.map(p => ({
        id: p.id,
        name: p.name,
        type: 'pickup',
        startLocation: p.StartLocation
      })),
      dropPoints: dropPoints.map(d => ({
        id: d.id,
        name: d.name,
        type: 'drop',
        endLocation: d.EndLocation
      })),
      carInfo: trip.Car,
      availableSeats,
      bookedSeats,
      minSeatPrice,
      seatsInfo: seats
    };

    // Remove the raw Car object if it exists
    if (result.Car) {
      delete result.Car;
    }

    return result;
  },

  updateTrip: async (id, data) => {
    const transaction = await sequelize.transaction();
    
    try {
      // First get the trip as a model instance with a lock
      const trip = await Trip.findByPk(id, { 
        transaction,
        lock: transaction.LOCK.UPDATE 
      });
      
      if (!trip) {
        throw new Error('Trip not found');
      }
      
      const updateData = { ...data };
      
      // Handle date conversions and duration calculation
      if (updateData.startTime && typeof updateData.startTime === 'string') {
        updateData.startTime = new Date(updateData.startTime);
      }
      if (updateData.endTime && typeof updateData.endTime === 'string') {
        updateData.endTime = new Date(updateData.endTime);
      }
      
      if (updateData.startTime || updateData.endTime) {
        const startTime = updateData.startTime || trip.startTime;
        const endTime = updateData.endTime || trip.endTime;
        updateData.duration = calculateDuration(new Date(startTime), new Date(endTime));
      }
      
      // Update the trip
      await trip.update(updateData, { transaction });
      
      // Handle seat updates if provided
      if (data.seatsInfo && Array.isArray(data.seatsInfo)) {
        // First, get all existing seats for this trip
        const existingSeats = await Seat.findAll({
          where: { tripId: id },
          transaction
        });
        
        // Create a map of existing seats by seatNumber for quick lookup
        const seatMap = new Map(existingSeats.map(seat => [seat.seatNumber, seat]));
        
        // Process each seat in the update
        for (const seatData of data.seatsInfo) {
          if (seatData.seatNumber && seatMap.has(seatData.seatNumber)) {
            // Update existing seat
            const seat = seatMap.get(seatData.seatNumber);
            await seat.update({
              seatType: seatData.seatType || seat.seatType,
              price: seatData.price !== undefined ? seatData.price : seat.price,
              // Don't update isBooked status here as it should be managed by bookings
            }, { transaction });
          } else if (seatData.seatNumber) {
            // Create new seat if it doesn't exist
            await Seat.create({
              tripId: id,
              seatNumber: seatData.seatNumber,
              seatType: seatData.seatType || 'standard',
              price: seatData.price || 0,
              isBooked: false
            }, { transaction });
          }
        }
      }
      
      // Handle meals update if provided
      if (data.meals && Array.isArray(data.meals)) {
        await trip.update({ meals: data.meals }, { transaction });
      }
      
      // Commit the transaction
      await transaction.commit();
      
      // Return the updated trip with all relationships
      return await tripService.getTripById(id);
      
    } catch (error) {
      // If anything goes wrong, rollback the transaction
      await transaction.rollback();
      throw error;
    }
  },

  searchTrips: async (queryParams = {}) => {
    try {
      const {
        startLocation,
        endLocation,
        from,
        to,
        date,
        minPrice = 0,
        maxPrice = 10000,
        minSeats = 1,
        timeRange,
        sortBy = 'departureEarliest',
      } = queryParams;
    
      const where = { status: 'active' }; // Only show active trips by default
    
      // Location Filters
      if (startLocation) where.startLocationId = parseInt(startLocation);
      if (endLocation) where.endLocationId = parseInt(endLocation);
      if (from) where.startLocationId = from;
      if (to) where.endLocationId = to;
      
      // Date filtering
      if (date) {
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
        where.startTime = {
          [Op.gte]: startDate,
          [Op.lt]: endDate,
        };
      } else {
        // If no date specified, only show future trips
        where.startTime = { [Op.gte]: new Date() };
      }

      // Include seat information
      const includeSeats = {
        model: Seat,
        as: 'seats',
        attributes: ['id', 'seatNumber', 'price', 'status', 'seatType'],
        required: false,
      };

      // Fetch trips with related data
      const trips = await Trip.findAll({
        where,
        include: [
          {
            model: Car,
            as: 'car',
            attributes: ['id', 'name', 'model', 'type', 'totalSeats', 'amenities', 'registrationNumber'],
            required: true
          },
          { 
            model: StartLocation, 
            as: 'startLocation', 
            attributes: ['id', 'name', 'address', 'city', 'state', 'pincode'] 
          },
          { 
            model: EndLocation, 
            as: 'endLocation', 
            attributes: ['id', 'name', 'address', 'city', 'state', 'pincode'] 
          },
          includeSeats,
        ],
        attributes: [
          'id', 
          'startTime', 
          'endTime', 
          'duration', 
          'status',
          'pickupPoints',
          'dropPoints',
          'meals',
          'createdAt',
          'updatedAt'
        ],
        order: [['startTime', 'ASC']]
      });
    
      // Process and format trips
      const processedTrips = trips.map(trip => {
        const seats = trip.seats || [];
        const availableSeats = seats.filter(seat => seat.status === 'available');
        const seatPrices = seats.map(seat => parseFloat(seat.price) || 0);
        const minSeatPrice = seatPrices.length ? Math.min(...seatPrices) : 0;
        const maxSeatPrice = seatPrices.length ? Math.max(...seatPrices) : 0;
        
        return {
          id: trip.id,
          startLocation: trip.startLocation,
          endLocation: trip.endLocation,
          pickupPoint: trip.pickupPoint,
          dropPoint: trip.dropPoint,
          car: trip.car,
          startTime: trip.startTime,
          endTime: trip.endTime,
          duration: trip.duration,
          status: trip.status,
          availableSeats: availableSeats.length,
          totalSeats: seats.length,
          minSeatPrice,
          maxSeatPrice,
          seats: availableSeats.map(seat => ({
            id: seat.id,
            seatNumber: seat.seatNumber,
            price: seat.price,
            seatType: seat.seatType,
            status: seat.status,
            isAvailable: seat.status === 'available'
          })),
          createdAt: trip.createdAt,
          updatedAt: trip.updatedAt
        };
      });
    
      // Apply additional filters
      let filteredTrips = processedTrips.filter(trip => {
        // Price filter
        if (minPrice && trip.minSeatPrice < minPrice) return false;
        if (maxPrice && trip.maxSeatPrice > maxPrice) return false;
        
        // Available seats filter
        if (trip.availableSeats < minSeats) return false;
        
        // Time range filter
        if (timeRange) {
          const hour = new Date(trip.startTime).getHours();
          let inRange = false;
          if (timeRange === 'morning' && hour >= 6 && hour < 12) inRange = true;
          if (timeRange === 'afternoon' && hour >= 12 && hour < 18) inRange = true;
          if (timeRange === 'evening' && hour >= 18 && hour < 21) inRange = true;
          if (timeRange === 'night' && (hour >= 21 || hour < 6)) inRange = true;
          if (!inRange) return false;
        }
        
        return true;
      });
    
      // Apply sorting
      if (sortBy === 'priceLowest') {
        filteredTrips.sort((a, b) => a.minSeatPrice - b.minSeatPrice);
      } else if (sortBy === 'priceHighest') {
        filteredTrips.sort((a, b) => b.maxSeatPrice - a.maxSeatPrice);
      } else if (sortBy === 'departureEarliest') {
        filteredTrips.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
      } else if (sortBy === 'departureLatest') {
        filteredTrips.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
      } else if (sortBy === 'seatsAvailable') {
        filteredTrips.sort((a, b) => b.availableSeats - a.availableSeats);
      }
    
      return filteredTrips;
    } catch (error) {
      console.error('Error in searchTrips:', error);
      throw new Error('Failed to search for trips. Please try again later.');
    }
  },
  

  getSeatsForTrip: async (tripId) => {
    const trip = await Trip.findByPk(tripId, {
      include: [
        {
          model: Seat,
          as: 'seats',
          attributes: ['id', 'seatNumber', 'price', 'isBooked', 'seatType'],
          order: [['seatNumber', 'ASC']]
        }
      ]
    });
    
    if (!trip) {
      throw new NotFound('Trip not found');
    }

    return trip.seats || [];
  },

  deleteTrip: async (id) => {
    const trip = await tripService.getTripById(id);
    // Delete related records first to avoid foreign key constraints
    await SeatPricing.destroy({ where: { tripId: id } });
    await BookedSeat.destroy({ where: { tripId: id } });
    await Booking.destroy({ where: { tripId: id } });
    await Trip.destroy({ where: { id } });
    return { message: 'Trip deleted successfully' };
  },
};

module.exports = tripService;
