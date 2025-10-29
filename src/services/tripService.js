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

  /*
  1st code
  searchTrips: async (queryParams = {}) => {
    try {
      const {
        startLocation,
        endLocation,
        date,
        pickupPoint,
        dropPoint,
        minPrice,
        maxPrice,
        minSeats,
        timeRange,
        duration,
        sortBy
      } = queryParams;
  
      const where = { status: true };
  
      // Location filters
      if (startLocation) where.start_location_id = parseInt(startLocation);
      if (endLocation) where.end_location_id = parseInt(endLocation);
  
      // Date filtering (IST-safe)
      if (date) {
        const [year, month, day] = date.split('-').map(Number);
        const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
        const endDate = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
        where.start_time = { [Op.gte]: startDate, [Op.lt]: endDate };
      } else {
        where.start_time = { [Op.gte]: new Date() };
      }
  
      // Include seats
      const includeSeats = {
        model: Seat,
        as: 'seats',
        attributes: ['id', 'seat_number', 'price', 'status', 'seat_type'],
        required: false
      };
  
      // Fetch trips
      let trips = await Trip.findAll({
        where,
        attributes: [
          'id',
          'start_time',
          'end_time',
          'duration',
          'status',
          'pickup_points',
          'drop_points',
          'meals',
          'created_at',
          'updated_at',
          'car_id',
          'start_location_id',
          'end_location_id'
        ],
        include: [
          {
            model: Car,
            attributes: [
              'id',
              'carName',
              'carType',
              'class',
              'totalSeats',
              'carUniqueNumber',
              'registrationNumber'
            ],
            required: true
          },
          {
            model: StartLocation,
            as: 'startLocation',
            attributes: ['id', 'name'],
            required: true
          },
          {
            model: EndLocation,
            as: 'endLocation',
            attributes: ['id', 'name'],
            required: true
          },
          includeSeats
        ],
        order: [['start_time', 'ASC']]
      });
  
      // Filter by pickup/drop if provided
      if (pickupPoint || dropPoint) {
        trips = trips.filter(trip => {
          const tripData = trip.get({ plain: true });
          const pArr = tripData.pickup_points || [];
          const dArr = tripData.drop_points || [];
  
          const matchPickup =
            !pickupPoint || pArr.includes(parseInt(pickupPoint));
  
          const matchDrop =
            !dropPoint || dArr.includes(parseInt(dropPoint));
  
          return matchPickup && matchDrop;
        });
      }
  
      // Helper: fetch point names
      async function fetchPointNames(ids, Model) {
        if (!Array.isArray(ids) || ids.length === 0) return [];
        const items = await Model.findAll({ where: { id: ids } });
        return items.map(p => ({ id: p.id, name: p.name }));
      }
  
      // Final formatting
      const finalTrips = [];
      for (const trip of trips) {
        const data = trip.get({ plain: true });
  
        // seats
        const seats = data.seats || [];
        const availableSeats = seats.filter(s => s.status === "available");
        const seatPrices = availableSeats.map(s => parseFloat(s.price) || 0);
        const minSeatPrice = seatPrices.length ? Math.min(...seatPrices) : 0;
  
        // pickup filter + fetch name
        const pickupId = pickupPoint ? parseInt(pickupPoint) : null;
        let pickupPoints = [];
        if (pickupId && data.pickup_points.includes(pickupId)) {
          pickupPoints = await fetchPointNames([pickupId], PickupPoint);
        }
  
        // drop filter + fetch name
        const dropId = dropPoint ? parseInt(dropPoint) : null;
        let dropPoints = [];
        if (dropId && data.drop_points.includes(dropId)) {
          dropPoints = await fetchPointNames([dropId], DropPoint);
        }
  
        // build final object
        finalTrips.push({
          id: data.id,
          startLocation: data.startLocation,
          endLocation: data.endLocation,
          startTime: data.start_time,
          endTime: data.end_time,
          availableSeats: availableSeats.length,
          pickupPoints: pickupPoints[0],
          dropPoints: dropPoints[0],
          meals: data.meals || [],
          seatsInfo: seats,
          carInfo: {
            id: data.Car?.id,
            name: data.Car?.carName,
            type: data.Car?.carType,
            class: data.Car?.class,
            totalSeats: data.Car?.totalSeats,
            carUniqueNumber: data.Car?.carUniqueNumber,
            registrationNumber: data.Car?.registrationNumber
          },
          minSeatPrice,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        });
      }
  
      return finalTrips;
  
    } catch (error) {
      console.error("Error in searchTrips:", error);
      throw new Error("Failed to search for trips. Please try again later.");
    }
  },
  */
  /* 2nd code*/
  // searchTrips: async (queryParams = {}) => {
  //   try {
  //     const {
  //       startLocation,
  //       endLocation,
  //       date,
  //       pickupPoint,
  //       dropPoint
  //     } = queryParams;
  
  //     const where = { status: true };
  
  //     // Location filters
  //     if (startLocation) where.start_location_id = parseInt(startLocation);
  //     if (endLocation) where.end_location_id = parseInt(endLocation);
  
  //     // Date filter (IST)
  //     if (date) {
  //       const [year, month, day] = date.split("-").map(Number);
  //       const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  //       const endDate = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
  
  //       where.start_time = {
  //         [Op.gte]: startDate,
  //         [Op.lt]: endDate
  //       };
  //     } else {
  //       where.start_time = { [Op.gte]: new Date() };
  //     }
  
  //     // Include seats
  //     const includeSeats = {
  //       model: Seat,
  //       as: "seats",
  //       attributes: ["id", "seat_number", "price", "status", "seat_type"],
  //       required: false
  //     };
  
  //     // Fetch trips
  //     let trips = await Trip.findAll({
  //       where,
  //       attributes: [
  //         "id",
  //         "start_time",
  //         "end_time",
  //         "duration",
  //         "status",
  //         "pickup_points",
  //         "drop_points",
  //         "meals",
  //         "created_at",
  //         "updated_at",
  //         "car_id",
  //         "start_location_id",
  //         "end_location_id"
  //       ],
  //       include: [
  //         {
  //           model: Car,
  //           attributes: [
  //             "id",
  //             "carName",
  //             "carType",
  //             "class",
  //             "totalSeats",
  //             "carUniqueNumber",
  //             "registrationNumber"
  //           ],
  //           required: true
  //         },
  //         {
  //           model: StartLocation,
  //           as: "startLocation",
  //           attributes: ["id", "name"],
  //           required: true
  //         },
  //         {
  //           model: EndLocation,
  //           as: "endLocation",
  //           attributes: ["id", "name"],
  //           required: true
  //         },
  //         includeSeats
  //       ],
  //       order: [["start_time", "ASC"]]
  //     });
  
  //     const pickupId = pickupPoint ? parseInt(pickupPoint) : null;
  //     const dropId = dropPoint ? parseInt(dropPoint) : null;
  
  //     // Filter by pickup & drop points only by ID validation
  //     trips = trips.filter(trip => {
  //       const data = trip.get({ plain: true });
  
  //       const pickupArr = Array.isArray(data.pickup_points)
  //         ? data.pickup_points
  //         : [];
  //       const dropArr = Array.isArray(data.drop_points)
  //         ? data.drop_points
  //         : [];
  
  //       const pickupValid = !pickupId || pickupArr.includes(pickupId);
  //       const dropValid = !dropId || dropArr.includes(dropId);
  
  //       return pickupValid && dropValid;
  //     });
  
  //     // Fetch pickup/drop names only IF they match
  //     let pickupPointRecord = null;
  //     let dropPointRecord = null;
  
  //     if (pickupId) {
  //       pickupPointRecord = await PickupPoint.findOne({
  //         where: { id: pickupId },
  //         attributes: ["id", "name"]
  //       });
  //     }
  
  //     if (dropId) {
  //       dropPointRecord = await DropPoint.findOne({
  //         where: { id: dropId },
  //         attributes: ["id", "name"]
  //       });
  //     }
  
  //     // Final formatting
  //     return trips.map(trip => {
  //       const t = trip.get({ plain: true });
  
  //       const seats = t.seats || [];
  
  //       const availableSeats = seats.filter(s => s.status === "available");
  
  //       const seatPrices = availableSeats.map(s => parseFloat(s.price) || 0);
  //       const minSeatPrice =
  //         seatPrices.length > 0 ? Math.min(...seatPrices) : 0;
  
  //       return {
  //         id: t.id,
  //         startLocation: t.startLocation?.name || "",
  //         endLocation: t.endLocation?.name || "",
  //         startTime: t.start_time,
  //         endTime: t.end_time,
  
  //         pickupPoint: pickupId && pickupPointRecord
  //           ? { id: pickupPointRecord.id, name: pickupPointRecord.name }
  //           : null,
  
  //         dropPoint: dropId && dropPointRecord
  //           ? { id: dropPointRecord.id, name: dropPointRecord.name }
  //           : null,
  
  //         availableSeats: availableSeats.length,
  
  //         seatsInfo: seats.map(s => ({
  //           id: s.id,
  //           seatNumber: s.seat_number,
  //           price: s.price,
  //           seatType: s.seat_type,
  //           isBooked: s.status !== "available"
  //         })),
  
  //         meals: t.meals || [],
  
  //         carInfo: {
  //           id: t.Car?.id,
  //           name: t.Car?.carName,
  //           type: t.Car?.carType,
  //           class: t.Car?.class,
  //           totalSeats: t.Car?.totalSeats,
  //           registrationNumber: t.Car?.registrationNumber,
  //           carUniqueNumber: t.Car?.carUniqueNumber
  //         },
  
  //         minSeatPrice,
  
  //         createdAt: t.created_at,
  //         updatedAt: t.updated_at
  //       };
  //     });
  //   } catch (error) {
  //     console.error("Error in searchTrips:", error);
  //     throw new Error("Failed to search for trips. Please try again later.");
  //   }
  // },
  
  searchTrips: async (queryParams = {}) => {
    try {
      const {
        startLocation,
        endLocation,
        date,
        pickupPoint,
        dropPoint,
        minPrice,
        maxPrice,
        minSeats,
        timeRange,
        sortBy
      } = queryParams;
  
      const where = { status: true };
  
      if (startLocation) where.start_location_id = parseInt(startLocation);
      if (endLocation) where.end_location_id = parseInt(endLocation);
  
      if (date) {
        const [year, month, day] = date.split("-").map(Number);
        const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
        const endDate = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
        where.start_time = { [Op.gte]: startDate, [Op.lt]: endDate };
      } else {
        where.start_time = { [Op.gte]: new Date() };
      }
  
      const includeSeats = {
        model: Seat,
        as: "seats",
        attributes: ["id", "seat_number", "price", "status", "seat_type"],
        required: false
      };
  
      let trips = await Trip.findAll({
        where,
        attributes: [
          "id",
          "start_time",
          "end_time",
          "duration",
          "status",
          "pickup_points",
          "drop_points",
          "meals",
          "created_at",
          "updated_at",
          "car_id",
          "start_location_id",
          "end_location_id"
        ],
        include: [
          {
            model: Car,
            attributes: [
              "id",
              "carName",
              "carType",
              "class",
              "totalSeats",
              "carUniqueNumber",
              "registrationNumber"
            ],
            required: true
          },
          {
            model: StartLocation,
            as: "startLocation",
            attributes: ["id", "name"],
            required: true
          },
          {
            model: EndLocation,
            as: "endLocation",
            attributes: ["id", "name"],
            required: true
          },
          includeSeats
        ]
      });
  
      // Filter by pickup & drop points and fetch names
      const filteredTrips = [];
      for (const trip of trips) {
        const t = trip.get({ plain: true });
        const availableSeats = (t.seats || []).filter(s => s.status === "available");
        const seatPrices = availableSeats.map(s => parseFloat(s.price) || 0);
        const minSeatPrice = seatPrices.length ? Math.min(...seatPrices) : 0;
  
        const pickupIdInt = pickupPoint ? parseInt(pickupPoint) : null;
        let pickupPointsArr = [];
        if (pickupIdInt && t.pickup_points.includes(pickupIdInt)) {
          pickupPointsArr = await fetchPointNames([pickupIdInt], PickupPoint);
        }
  
        const dropIdInt = dropPoint ? parseInt(dropPoint) : null;
        let dropPointsArr = [];
        if (dropIdInt && t.drop_points.includes(dropIdInt)) {
          dropPointsArr = await fetchPointNames([dropIdInt], DropPoint);
        }
  
        // Skip trip if pickup/drop point filter doesn't match
        if ((pickupIdInt && pickupPointsArr.length === 0) || (dropIdInt && dropPointsArr.length === 0)) {
          continue;
        }
  
        // Backend filters: price, seats, time
        if (minPrice && minSeatPrice < minPrice) continue;
        if (maxPrice && minSeatPrice > maxPrice) continue;
        if (minSeats && availableSeats.length < minSeats) continue;
  
        if (timeRange) {
          const hour = new Date(t.start_time).getHours();
          if (timeRange === "morning" && (hour < 6 || hour >= 12)) continue;
          if (timeRange === "afternoon" && (hour < 12 || hour >= 18)) continue;
          if (timeRange === "evening" && (hour < 18 || hour >= 21)) continue;
          if (timeRange === "night" && !(hour >= 21 || hour < 6)) continue;
        }
  
        filteredTrips.push({
          id: t.id,
          startLocation: t.startLocation,
          endLocation: t.endLocation,
          startTime: t.start_time,
          endTime: t.end_time,
          duration: t.duration,
          availableSeats: availableSeats.length,
          seatsInfo: availableSeats,
          pickupPoint: pickupPointsArr[0],
          dropPoint: dropPointsArr[0],
          meals: t.meals || [],
          carInfo: {
            id: t.Car?.id,
            name: t.Car?.carName,
            type: t.Car?.carType,
            class: t.Car?.class,
            totalSeats: t.Car?.totalSeats,
            registrationNumber: t.Car?.registrationNumber,
            carUniqueNumber: t.Car?.carUniqueNumber
          },
          minSeatPrice,
          createdAt: t.created_at,
          updatedAt: t.updated_at
        });
      }
  
      // Sorting
      if (sortBy === "priceLowHigh") filteredTrips.sort((a, b) => a.minSeatPrice - b.minSeatPrice);
      else if (sortBy === "priceHighLow") filteredTrips.sort((a, b) => b.minSeatPrice - a.minSeatPrice);
      else if (sortBy === "departureEarliest") filteredTrips.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
      else if (sortBy === "departureLatest") filteredTrips.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  
      return filteredTrips;
  
    } catch (error) {
      console.error("Error in searchTrips:", error);
      throw new Error("Failed to search for trips. Please try again later.");
    }
    
    // Helper function
    async function fetchPointNames(ids, Model) {
      if (!Array.isArray(ids) || ids.length === 0) return [];
      const items = await Model.findAll({ where: { id: ids } });
      return items.map(p => ({ id: p.id, name: p.name }));
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
