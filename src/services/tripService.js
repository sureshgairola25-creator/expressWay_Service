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
const { Op, Sequelize,literal } = require('sequelize');
const { NotFound } = require('http-errors');
const { BadRequestError, ConflictError } = require('../utils/errors');
const { calculateDuration, toIST, nowIST, toISTString, toISTLuxon } = require('../utils/dateUtils');

const tripService = {
  createTrip: async (data, options = {}) => {
    const tripData = { ...data };

    if (tripData.startTime && typeof tripData.startTime === 'string') {
      tripData.startTime = new Date(tripData.startTime);
    }
    if (tripData.endTime && typeof tripData.endTime === 'string') {
      tripData.endTime = new Date(tripData.endTime);
    }

    if (tripData.startTime && tripData.endTime) {
      tripData.duration = calculateDuration(tripData.startTime, tripData.endTime);
    }

    return await Trip.create(tripData, options);
  },

  findTripByCarAndDate: async (carId, startTime) => {
    const tripStart = typeof startTime === 'string' ? new Date(startTime) : startTime;

    return await Trip.findOne({
      where: {
        carId,
        [Op.or]: [
          { startTime: { [Op.lte]: tripStart }, endTime: { [Op.gt]: tripStart } },
          { startTime: { [Op.lt]: tripStart }, endTime: { [Op.gte]: tripStart } },
          { startTime: { [Op.gte]: tripStart }, endTime: { [Op.lte]: tripStart } }
        ]
      },
    });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // createTripWithSeats
  // Price is now ALWAYS derived from the car — not passed from frontend
  // For sharing:     each seat gets car.pricePerSeat
  // For cabin:       each seat gets car.pricePerCabin (price per cabin unit)
  // For personalize: each seat gets car.pricePerCar (flat, whole car)
  // // ─────────────────────────────────────────────────────────────────────────
  // createTripWithSeats: async (tripData, seats, meals = []) => {
  //   return await sequelize.transaction(async (transaction) => {
  //     // Check for duplicate trip
  //     const existingTrip = await tripService.findTripByCarAndDate(
  //       tripData.carId,
  //       tripData.startTime
  //     );

  //     if (existingTrip) {
  //       throw new ConflictError('A trip already exists for this car during the selected time period');
  //     }

  //     // Calculate duration
  //     const duration = calculateDuration(new Date(tripData.startTime), new Date(tripData.endTime));

  //     // Validate seats
  //     if (!seats || !Array.isArray(seats) || seats.length === 0) {
  //       throw new BadRequestError('At least one seat is required');
  //     }

  //     seats.forEach((seat, index) => {
  //       if (!seat.seatNumber) {
  //         throw new BadRequestError(`Seat at index ${index} is missing seatNumber`);
  //       }
  //     });

  //     // Validate meals
  //     if (meals && meals.length > 0) {
  //       meals.forEach((meal, index) => {
  //         if (!meal.type || typeof meal.price !== 'number') {
  //           throw new BadRequestError(`Meal at index ${index} is missing required fields (type, price)`);
  //         }
  //       });
  //     }

  //     // Get the car — we derive ALL pricing from here
  //     const car = await Car.findByPk(tripData.carId, { transaction });
  //     if (!car) {
  //       throw new BadRequestError('Car not found');
  //     }

  //     // Determine seat price based on cab type
  //     // sharing    → pricePerSeat (per individual seat)
  //     // cabin      → pricePerCabin (per cabin unit)
  //     // personalize→ pricePerCar (flat for whole car)
  //     const seatPrice = getSeatPriceFromCar(car);

  //     // Prepare trip data
  //     const tripToCreate = {
  //       ...tripData,
  //       duration,
  //       meals: meals.length > 0 ? meals : null
  //     };

  //     // Create the trip
  //     const trip = await tripService.createTrip(tripToCreate, { transaction });

  //     // Create seats — price always from car, seatType from frontend
  //     const seatData = seats.map(seat => ({
  //       seatNumber: seat.seatNumber,
  //       seatType: seat.seatType || 'middle',
  //       tripId: trip.id,
  //       price: seatPrice,
  //       isBooked: false
  //     }));

  //     await Seat.bulkCreate(seatData, { transaction });

  //     return trip;
  //   });
  // },

  // new create trip function which make create mutiple trip basis of timings
  // Replace createTripWithSeats with this version that accepts multiple times
createTripWithSeats: async (tripData, seats, meals = []) => {
  return await sequelize.transaction(async (transaction) => {

    // ── Multi-timing support ────────────────────────────────────────────────
    // tripData.startTimes = ['2026-03-30 06:00:00', '2026-03-30 10:00:00', ...]
    // If single time, wrap in array for uniform handling
    const startTimes = Array.isArray(tripData.startTimes)
      ? tripData.startTimes
      : [tripData.startTime];

    if (startTimes.length === 0) {
      throw new BadRequestError('At least one departure time is required');
    }

    // Validate seats
    if (!seats?.length) throw new BadRequestError('At least one seat is required');
    seats.forEach((seat, i) => {
      if (!seat.seatNumber) throw new BadRequestError(`Seat at index ${i} missing seatNumber`);
    });

    // Validate meals
    if (meals?.length) {
      meals.forEach((meal, i) => {
        if (!meal.type || typeof meal.price !== 'number')
          throw new BadRequestError(`Meal at index ${i} missing type or price`);
      });
    }

    // Get car for pricing
    const car = await Car.findByPk(tripData.carId, { transaction });
    if (!car) throw new BadRequestError('Car not found');
    const seatPrice = getSeatPriceFromCar(car);

    // ── Generate shared group ID for all trips in this batch ──────────────
    const { v4: uuidv4 } = require('uuid');
    const tripGroupId = startTimes.length > 1 ? uuidv4() : null;

    const createdTrips = [];

    for (const startTime of startTimes) {
      // Check duplicate per car + time
      const existing = await tripService.findTripByCarAndDate(
        tripData.carId, startTime
      );
      if (existing) {
        throw new ConflictError(
          `A trip already exists for this car at ${startTime}`
        );
      }

      const startDt  = new Date(startTime);
      // Calculate endTime by adding duration offset from original startTime → endTime
      let endDt;
      if (tripData.startTime && tripData.endTime) {
        const durationMs = new Date(tripData.endTime) - new Date(tripData.startTime);
        endDt = new Date(startDt.getTime() + durationMs);
      } else {
        endDt = new Date(startDt.getTime() + 5 * 60 * 60 * 1000); // default 5h
      }

      const duration = calculateDuration(startDt, endDt);

      const tripToCreate = {
        startLocationId: tripData.startLocationId,
        endLocationId:   tripData.endLocationId,
        pickupPoints:    tripData.pickupPoints,
        dropPoints:      tripData.dropPoints,
        carId:           tripData.carId,
        startTime:       startDt,
        endTime:         endDt,
        duration,
        status:          tripData.status ?? true,
        isRecurring:     tripData.isRecurring ?? true,
        repeatType:      tripData.repeatType  ?? 'daily',
        meals:           meals.length > 0 ? meals : null,
        tripGroupId,     // ← links all trips in this batch
      };

      const trip = await tripService.createTrip(tripToCreate, { transaction });

      // Create seats for this trip
      await Seat.bulkCreate(
        seats.map(seat => ({
          seatNumber: seat.seatNumber,
          seatType:   seat.seatType || 'middle',
          tripId:     trip.id,
          price:      seatPrice,
          isBooked:   false,
        })),
        { transaction }
      );

      createdTrips.push(trip);
    }

    return createdTrips; // array of created trips
  });
},

  getAllTrips: async (query = {}) => {
    const { pickupPoint, dropPoint, date, ...otherFilters } = query;
    const where = { ...otherFilters };

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      where.startTime = { [Op.between]: [startOfDay, endOfDay] };
    }

    const tripIds = await Trip.findAll({
      where,
      attributes: ['id'],
      raw: true
    }).then(trips => trips.map(trip => trip.id));

    if (tripIds.length === 0) return [];

    const trips = await Trip.findAll({
      where: { id: { [Op.in]: tripIds } },
      include: [
        {
          model: Car,
          // Include all new pricing fields for admin display
          attributes: [
'id','carName','carType','totalSeats',
'registrationNumber','cabType',
'pricePerSeat','pricePerCabin',
'cabinCapacity','totalCabins',
'pricePerCar','imageUrl'
],
          required: true,
        },

{
  model: StartLocation,
  as: 'startLocation',    // ← add
  attributes: ['id', 'name'],
  required: false
},
{
  model: EndLocation,
  as: 'endLocation',      // ← add
  attributes: ['id', 'name'],
  required: false
}
      ],
      attributes: ['id', 'pickupPoints', 'dropPoints','startLocationId',
'endLocationId', 'startTime', 'endTime', 'duration', 'status','tripGroupId', 'created_at', 'updated_at'],
      order: [['created_at', 'DESC']]
    });

    const allSeats = await Seat.findAll({
      where: { tripId: { [Op.in]: tripIds } },
      attributes: ['id', 'tripId', 'seatNumber', 'seatType', 'price', 'isBooked'],
      raw: true
    });

    const seatsByTrip = allSeats.reduce((acc, seat) => {
      if (!acc[seat.tripId]) acc[seat.tripId] = [];
      acc[seat.tripId].push(seat);
      return acc;
    }, {});

    const processedTrips = await Promise.all(trips.map(async (trip) => {
      const seats = seatsByTrip[trip.id] || [];
      

      const pickupPointIds = Array.isArray(trip.pickupPoints)
        ? trip.pickupPoints
        : JSON.parse(trip.pickupPoints || '[]');

      const dropPointIds = Array.isArray(trip.dropPoints)
        ? trip.dropPoints
        : JSON.parse(trip.dropPoints || '[]');

      const [pickupPoints, dropPoints] = await Promise.all([
        pickupPointIds.length > 0 ? PickupPoint.findAll({
          where: { id: pickupPointIds, status: true },
          attributes: ['id', 'name'],
          include: [{ model: StartLocation, attributes: ['id', 'name'], required: true }],
          raw: true, nest: true
        }) : [],

        dropPointIds.length > 0 ? DropPoint.findAll({
          where: { id: dropPointIds, status: true },
          attributes: ['id', 'name'],
          include: [{ model: EndLocation, attributes: ['id', 'name'], required: true }],
          raw: true, nest: true
        }) : []
      ]);

      const availableSeats = seats.filter(s => !s.isBooked).length;

      // Price shown in list is derived from car
      const displayPrice = getDisplayPrice(trip.Car);

      if (pickupPoint && !pickupPoints.some(p => p.id == pickupPoint)) return null;
      if (dropPoint && !dropPoints.some(p => p.id == dropPoint)) return null;

      return {
        id: trip.id,
        tripGroupId:  trip.tripGroupId || null, 
        startLocation:  trip.startLocation  || null,   // { id, name }
        endLocation:    trip.endLocation    || null,   // { id, name }
        startLocationId: trip.startLocationId,
        endLocationId:   trip.endLocationId,
        pickupPoints: pickupPoints.map(p => ({
          id: p.id, name: p.name, type: 'pickup', startLocation: p.StartLocation
        })),
        dropPoints: dropPoints.map(d => ({
          id: d.id, name: d.name, type: 'drop', endLocation: d.EndLocation
        })),
        carInfo: trip.Car,
        startTime: trip.startTime,
        endTime: trip.endTime,
        duration: trip.duration,
        status: trip.status,
        availableSeats,
        seatsInfo: seats,
        displayPrice,           // price to show in UI
        created_at: trip.created_at,
        updated_at: trip.updated_at
      };
    }));

     const filtered = processedTrips.filter(Boolean);

  // ── Group trips by tripGroupId ─────────────────────────────────────────
  const groups   = {};
  const ungrouped = [];

  for (const trip of filtered) {
    if (trip.tripGroupId) {
      if (!groups[trip.tripGroupId]) {
        groups[trip.tripGroupId] = { ...trip, timings: [trip.startTime] };
      } else {
        groups[trip.tripGroupId].timings.push(trip.startTime);
        // Keep earliest time as primary
        if (new Date(trip.startTime) < new Date(groups[trip.tripGroupId].startTime)) {
          groups[trip.tripGroupId].startTime = trip.startTime;
          groups[trip.tripGroupId].endTime   = trip.endTime;
        }
      }
    } else {
      ungrouped.push({ ...trip, timings: [trip.startTime] });
    }
  }

  return [...Object.values(groups), ...ungrouped]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
},

  getTripById: async (id) => {
    const trip = await Trip.findByPk(id, {
      include: [
        {
          model: Car,
          attributes: [
            'id', 'carName', 'carType', 'totalSeats', 'registrationNumber',
            'cabType', 'pricePerSeat', 'pricePerCabin', 'cabinCapacity',
            'totalCabins', 'pricePerCar', 'imageUrl'
          ]
        }
      ],
      attributes: ['id', 'pickupPoints', 'dropPoints', 'startTime', 'endTime', 'duration', 'status', 'meals', 'is_fully_booked']
    });

    if (!trip) throw new NotFound('Trip not found');

    const seats = await Seat.findAll({
      where: { tripId: id },
      attributes: ['id', 'seatNumber', 'seatType', 'price', 'isBooked'],
      raw: true
    });

    const pickupPointIds = Array.isArray(trip.pickupPoints)
      ? trip.pickupPoints
      : (trip.pickupPoints ? JSON.parse(trip.pickupPoints) : []);

    const dropPointIds = Array.isArray(trip.dropPoints)
      ? trip.dropPoints
      : (trip.dropPoints ? JSON.parse(trip.dropPoints) : []);

    const [pickupPoints, dropPoints] = await Promise.all([
      pickupPointIds.length > 0 ? PickupPoint.findAll({
        where: { id: pickupPointIds, status: true },
        attributes: ['id', 'name'],
        include: [{ model: StartLocation, attributes: ['id', 'name'], required: true }],
        raw: true, nest: true
      }) : [],

      dropPointIds.length > 0 ? DropPoint.findAll({
        where: { id: dropPointIds, status: true },
        attributes: ['id', 'name'],
        include: [{ model: EndLocation, attributes: ['id', 'name'], required: true }],
        raw: true, nest: true
      }) : []
    ]);

    const availableSeats = seats.filter(s => !s.isBooked).length;
    const displayPrice = getDisplayPrice(trip.Car);

    const result = {
      ...trip.get({ plain: true }),
      pickupPoints: pickupPoints.map(p => ({
        id: p.id, name: p.name, type: 'pickup', startLocation: p.StartLocation
      })),
      dropPoints: dropPoints.map(d => ({
        id: d.id, name: d.name, type: 'drop', endLocation: d.EndLocation
      })),
      carInfo: trip.Car,
      availableSeats,
      displayPrice,
      seatsInfo: seats
    };

    if (result.Car) delete result.Car;

    return result;
  },

  updateTrip: async (id, data) => {
    const transaction = await sequelize.transaction();

    try {
      const trip = await Trip.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!trip) throw new Error('Trip not found');

      const updateData = { ...data };

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

      await trip.update(updateData, { transaction });

      // Handle seat updates — re-derive price from car if car changed
      if (data.seatsInfo && Array.isArray(data.seatsInfo)) {
        const car = await Car.findByPk(trip.carId, { transaction });
        if (!car) throw new BadRequestError('Car not found');

        const seatPrice = getSeatPriceFromCar(car);
        const existingSeats = await Seat.findAll({ where: { tripId: id }, transaction });
        const seatMap = new Map(existingSeats.map(seat => [seat.seatNumber, seat]));

        for (const seatData of data.seatsInfo) {
          if (seatData.seatNumber && seatMap.has(seatData.seatNumber)) {
            const seat = seatMap.get(seatData.seatNumber);
            await seat.update({
              seatType: seatData.seatType || seat.seatType,
              price: seatPrice, // always re-derive from car, never from frontend
            }, { transaction });
          } else if (seatData.seatNumber) {
            await Seat.create({
              tripId: id,
              seatNumber: seatData.seatNumber,
              seatType: seatData.seatType || 'middle',
              price: seatPrice,
              isBooked: false
            }, { transaction });
          }
        }
      }

      if (data.meals && Array.isArray(data.meals)) {
        await trip.update({ meals: data.meals }, { transaction });
      }

      await transaction.commit();
      return await tripService.getTripById(id);

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

 // ─────────────────────────────────────────────────────────────────────────────
// PASTE THIS TEMPORARILY in tripService.js to debug why trips are filtered out
// Remove the console.log lines once the issue is found
// ─────────────────────────────────────────────────────────────────────────────

// searchTrips: async (queryParams = {}) => {
//   try {
//     let {
//       startLocation, endLocation, date, pickupPoint, dropPoint,
//       minPrice, maxPrice, minSeats, timeRange, sortBy
//     } = queryParams;

//     // Sanitize empty strings
//     if (!timeRange || timeRange.trim() === '') timeRange = null;
//     if (!sortBy    || sortBy.trim()    === '') sortBy    = null;
//     if (!minPrice  || minPrice.trim()  === '') minPrice  = null;
//     if (!maxPrice  || maxPrice.trim()  === '') maxPrice  = null;
//     if (!minSeats  || minSeats.trim()  === '') minSeats  = null;

//     // Validate date
//     if (!date || date.trim() === '') {
//       return { error: true, message: 'Date is required. Use format YYYY-MM-DD' };
//     }
//     const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
//     if (!dateRegex.test(date.trim())) {
//       return { error: true, message: 'Invalid date format. Use YYYY-MM-DD' };
//     }
//     const parsedDate = new Date(date + 'T00:00:00.000Z');
//     if (isNaN(parsedDate.getTime())) {
//       return { error: true, message: 'Invalid date format. Use YYYY-MM-DD' };
//     }
//     const searchDate = date.trim();

//     // ── Build WHERE ───────────────────────────────────────────────────────────
//     // IMPORTANT: using camelCase because Sequelize maps these to snake_case via 'field'
//     const where = { status: true };
//     if (startLocation) where.startLocationId = parseInt(startLocation);
//     if (endLocation)   where.endLocationId   = parseInt(endLocation);

//     console.log('[DEBUG] WHERE clause:', JSON.stringify(where));
//     console.log('[DEBUG] searchDate:', searchDate);

//     // ── Fetch trips ───────────────────────────────────────────────────────────
//     const trips = await Trip.findAll({
//       where,
//       include: [
//         {
//           model: Car,
//           attributes: [
//             'id', 'carName', 'carType', 'class', 'totalSeats',
//             'carUniqueNumber', 'registrationNumber',
//             'cabType', 'pricePerSeat', 'pricePerCabin',
//             'cabinCapacity', 'totalCabins', 'pricePerCar', 'imageUrl'
//           ],
//           required: true
//         },
//         {
//           model: Seat,
//           as: 'seats',
//           attributes: ['id', 'seatNumber', 'price', 'isBooked', 'seatType'],
//           required: false
//         },
//         {
//           model: StartLocation,
//           as: 'startLocation',
//           attributes: ['id', 'name'],
//           required: true
//         },
//         {
//           model: EndLocation,
//           as: 'endLocation',
//           attributes: ['id', 'name'],
//           required: true
//         }
//       ],
//       order: [['startTime', 'ASC']]
//     });

//     console.log(`[DEBUG] Total trips from DB: ${trips.length}`);
//     trips.forEach(t => {
//       console.log(`[DEBUG] Trip ${t.id}:`, {
//         startTime: t.startTime,
//         isRecurring: t.isRecurring,
//         status: t.status,
//         isFullyBooked: t.isFullyBooked,
//         pickupPoints: t.pickupPoints,
//         dropPoints: t.dropPoints,
//         startLocationId: t.startLocationId,
//         endLocationId: t.endLocationId,
//       });
//     });

//     // ✅ FIX — specify only id and name
// async function fetchPointNames(ids, Model) {
//   if (!Array.isArray(ids) || ids.length === 0) return [];
//   const items = await Model.findAll({
//     where: { id: ids },
//     attributes: ['id', 'name']   // ← only fetch what we need
//   });
//   return items.map(p => ({ id: p.id, name: p.name }));
// }

//     const filteredTrips = [];

//     for (const t of trips) {
//       console.log(`\n[DEBUG] ── Processing trip ${t.id} ──`);

//       // Guard: valid startTime
//       if (!t.startTime || isNaN(new Date(t.startTime).getTime())) {
//         console.log(`[DEBUG] SKIP trip ${t.id} — invalid startTime:`, t.startTime);
//         continue;
//       }

//       const tripDateStr = new Date(t.startTime).toISOString().split('T')[0];
//       console.log(`[DEBUG] tripDateStr: ${tripDateStr}, searchDate: ${searchDate}, isRecurring: ${t.isRecurring}`);

//       // Recurring check
//       if (t.isRecurring) {
//         if (searchDate < tripDateStr) {
//           console.log(`[DEBUG] SKIP trip ${t.id} — searchDate ${searchDate} < tripDate ${tripDateStr}`);
//           continue;
//         }
//         console.log(`[DEBUG] PASS recurring date check`);
//       } else {
//         if (tripDateStr !== searchDate) {
//           console.log(`[DEBUG] SKIP trip ${t.id} — one-time trip, date mismatch`);
//           continue;
//         }
//         console.log(`[DEBUG] PASS one-time date check`);
//       }

//       // Fully booked
//       if (t.isFullyBooked) {
//         console.log(`[DEBUG] SKIP trip ${t.id} — fully booked`);
//         continue;
//       }

//       // Pickup/drop point filter
//       const pickupIds = Array.isArray(t.pickupPoints)
//         ? t.pickupPoints
//         : JSON.parse(t.pickupPoints || '[]');

//       const dropIds = Array.isArray(t.dropPoints)
//         ? t.dropPoints
//         : JSON.parse(t.dropPoints || '[]');

//       console.log(`[DEBUG] pickupIds from DB: ${JSON.stringify(pickupIds)}, requested pickupPoint: ${pickupPoint}`);
//       console.log(`[DEBUG] dropIds from DB: ${JSON.stringify(dropIds)}, requested dropPoint: ${dropPoint}`);

//       const pickupIdInt = pickupPoint ? parseInt(pickupPoint) : null;
//       const dropIdInt   = dropPoint   ? parseInt(dropPoint)   : null;

//       if (pickupIdInt && !pickupIds.includes(pickupIdInt)) {
//         console.log(`[DEBUG] SKIP trip ${t.id} — pickupPoint ${pickupIdInt} not in [${pickupIds}]`);
//         continue;
//       }

//       if (dropIdInt && !dropIds.includes(dropIdInt)) {
//         console.log(`[DEBUG] SKIP trip ${t.id} — dropPoint ${dropIdInt} not in [${dropIds}]`);
//         continue;
//       }

//       console.log(`[DEBUG] PASS pickup/drop check`);

//       // Bookings for this date
//       const bookingsForDate = await Booking.findAll({
//         where: {
//           tripId: t.id,
//           journeyDate: searchDate,
//           bookingStatus: { [Op.not]: 'cancelled' }
//         },
//         attributes: ['seats']
//       });

//       const bookedSeatNumbers = bookingsForDate.flatMap(b => {
//         try {
//           const parsed = typeof b.seats === 'string' ? JSON.parse(b.seats) : (b.seats || []);
//           return parsed.map(s => s.seatNumber || s.seat_number || s);
//         } catch (e) { return []; }
//       });

//       const seatsInfo = (t.seats || []).map(seat => ({
//         id: seat.id,
//         seatNumber: seat.seatNumber,
//         seatType: seat.seatType,
//         price: seat.price,
//         isBooked: bookedSeatNumbers.includes(seat.seatNumber)
//       }));

//       const leftSeats = seatsInfo.filter(s => !s.isBooked);
//       console.log(`[DEBUG] Total seats: ${t.seats?.length}, Available: ${leftSeats.length}`);

//       const displayPrice = getDisplayPrice(t.Car);

//       if (minPrice && displayPrice < parseFloat(minPrice)) { console.log(`[DEBUG] SKIP — minPrice filter`); continue; }
//       if (maxPrice && displayPrice > parseFloat(maxPrice)) { console.log(`[DEBUG] SKIP — maxPrice filter`); continue; }
//       if (minSeats && leftSeats.length < parseInt(minSeats)) { console.log(`[DEBUG] SKIP — minSeats filter`); continue; }

//       if (timeRange) {
//         const tripTime = new Date(t.startTime);
//         const istHour  = (tripTime.getUTCHours() + 5.5) % 24;
//         const isMorning   = istHour >= 6  && istHour < 12;
//         const isAfternoon = istHour >= 12 && istHour < 17;
//         const isEvening   = istHour >= 17 && istHour < 21;
//         const isNight     = istHour >= 21 || istHour < 6;

//         if (
//           (timeRange === 'morning'   && !isMorning)   ||
//           (timeRange === 'afternoon' && !isAfternoon) ||
//           (timeRange === 'evening'   && !isEvening)   ||
//           (timeRange === 'night'     && !isNight)
//         ) { console.log(`[DEBUG] SKIP — timeRange filter`); continue; }
//       }

//       const pickupPointsArr = pickupIdInt
//         ? await fetchPointNames([pickupIdInt], PickupPoint)
//         : await fetchPointNames(pickupIds, PickupPoint);

//       const dropPointsArr = dropIdInt
//         ? await fetchPointNames([dropIdInt], DropPoint)
//         : await fetchPointNames(dropIds, DropPoint);

//       console.log(`[DEBUG] PASS all filters — adding trip ${t.id} to results`);

//       filteredTrips.push({
//         id: t.id,
//         startLocation: t.startLocation,
//         endLocation: t.endLocation,
//         startTime: t.startTime,
//         endTime: t.endTime,
//         duration: t.duration,
//         isRecurring: t.isRecurring || false,
//         availableSeats: leftSeats.length,
//         seatsInfo,
//         pickupPoints: pickupPointsArr,
//         dropPoints: dropPointsArr,
//         meals: t.meals || [],
//         carInfo: {
//           id:                 t.Car?.id,
//           name:               t.Car?.carName,
//           type:               t.Car?.carType,
//           class:              t.Car?.class,
//           totalSeats:         t.Car?.totalSeats,
//           registrationNumber: t.Car?.registrationNumber,
//           carUniqueNumber:    t.Car?.carUniqueNumber,
//           cabType:            t.Car?.cabType,
//           pricePerSeat:       t.Car?.pricePerSeat,
//           pricePerCabin:      t.Car?.pricePerCabin,
//           cabinCapacity:      t.Car?.cabinCapacity,
//           totalCabins:        t.Car?.totalCabins,
//           pricePerCar:        t.Car?.pricePerCar,
//           imageUrl:           t.Car?.imageUrl,
//         },
//         displayPrice,
//         createdAt: t.createdAt,
//         updatedAt: t.updatedAt
//       });
//     }

//     console.log(`[DEBUG] Final result count: ${filteredTrips.length}`);

//     if (sortBy === 'priceLowHigh')          filteredTrips.sort((a, b) => a.displayPrice - b.displayPrice);
//     else if (sortBy === 'priceHighLow')     filteredTrips.sort((a, b) => b.displayPrice - a.displayPrice);
//     else if (sortBy === 'departureEarliest') filteredTrips.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
//     else if (sortBy === 'departureLatest')  filteredTrips.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

//     return filteredTrips;

//   } catch (error) {
//     console.error('[searchTrips] Unexpected error:', error);
//     throw new Error('Failed to search for trips. Please try again later.');
//   }
// },

// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/services/tripService.js
// Replace your searchTrips function with this complete fixed version
// Fixes:
// 1. Excludes personalize trips (cabType filter)
// 2. All filters working: price, time, seats, sort
// 3. Safe sanitize (no .trim() crash)
// 4. Correct displayPrice per cabType
// ─────────────────────────────────────────────────────────────────────────────

searchTrips: async (queryParams = {}) => {
  try {
    let {
      startLocation, endLocation, date, pickupPoint, dropPoint,
      minPrice, maxPrice, minSeats, timeRange, sortBy
    } = queryParams;

    // ── Safe sanitize — query params are strings but guard anyway ────────────
    const toStr = (v) => (v !== undefined && v !== null ? String(v).trim() : null);

    timeRange = toStr(timeRange) || null;
    sortBy    = toStr(sortBy)    || null;
    minPrice  = toStr(minPrice)  || null;
    maxPrice  = toStr(maxPrice)  || null;
    minSeats  = toStr(minSeats)  || null;

    // ── Validate date ────────────────────────────────────────────────────────
    if (!date || String(date).trim() === '') {
      return { error: true, message: 'Date is required. Use format YYYY-MM-DD' };
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const dateStr   = String(date).trim();
    if (!dateRegex.test(dateStr)) {
      return { error: true, message: 'Invalid date format. Use YYYY-MM-DD' };
    }
    const parsedDate = new Date(dateStr + 'T00:00:00.000Z');
    if (isNaN(parsedDate.getTime())) {
      return { error: true, message: 'Invalid date format. Use YYYY-MM-DD' };
    }
    const searchDate = dateStr;

    // ── Build WHERE ──────────────────────────────────────────────────────────
    const where = { status: true };
    if (startLocation) where.startLocationId = parseInt(startLocation);
    if (endLocation)   where.endLocationId   = parseInt(endLocation);

    // ── ✅ FIX 1: Exclude personalize trips from this API ────────────────────
    // Personalize has its own endpoint: GET /trips/search-personalize
    where['$Car.cab_type$'] = { [Op.in]: ['sharing', 'cabin'] };

    // ── Fetch trips ──────────────────────────────────────────────────────────
    const trips = await Trip.findAll({
      where,
      include: [
        {
          model: Car,
          attributes: [
            'id', 'carName', 'carType', 'class', 'totalSeats',
            'carUniqueNumber', 'registrationNumber',
            'cabType', 'pricePerSeat', 'pricePerCabin',
            'cabinCapacity', 'totalCabins', 'pricePerCar', 'imageUrl'
          ],
          required: true,
          // ✅ Also filter at join level for safety
          where: { cabType: { [Op.in]: ['sharing', 'cabin'] } },
        },
        {
          model: Seat,
          as: 'seats',
          attributes: ['id', 'seatNumber', 'price', 'isBooked', 'seatType'],
          required: false
        },
        {
          model: StartLocation,
          as: 'startLocation',
          attributes: ['id', 'name', 'city'],
          required: true
        },
        {
          model: EndLocation,
          as: 'endLocation',
          attributes: ['id', 'name'],
          required: true
        }
      ],
      order: [['startTime', 'ASC']]
    });

    // ── Helper: fetch point names ────────────────────────────────────────────
    async function fetchPointNames(ids, Model) {
      if (!Array.isArray(ids) || ids.length === 0) return [];
      const items = await Model.findAll({
        where: { id: ids },
        attributes: ['id', 'name'],
      });
      return items.map(p => ({ id: p.id, name: p.name }));
    }

    // ── ✅ FIX 2: Correct displayPrice per cabType ───────────────────────────
    // Sharing → pricePerSeat, Cabin → pricePerCabin
    // This is what price filter compares against
    function getDisplayPrice(car) {
      if (!car) return 0;
      if (car.cabType === 'cabin') {
        return parseFloat(car.pricePerCabin || car.pricePerSeat || 0);
      }
      return parseFloat(car.pricePerSeat || 0);
    }

    const filteredTrips = [];

    for (const t of trips) {

      // Guard: valid startTime
      if (!t.startTime || isNaN(new Date(t.startTime).getTime())) continue;

      const tripDateStr = new Date(t.startTime).toISOString().split('T')[0];

      // ── Date filter ───────────────────────────────────────────────────────
      if (t.isRecurring) {
        if (searchDate < tripDateStr) continue;   // before trip start
      } else {
        if (tripDateStr !== searchDate) continue;  // non-recurring: exact match
      }

      // ── Fully booked check ────────────────────────────────────────────────
      if (t.isFullyBooked) continue;

      // ── Pickup/drop IDs ───────────────────────────────────────────────────
      const pickupIds   = Array.isArray(t.pickupPoints)
        ? t.pickupPoints
        : JSON.parse(t.pickupPoints || '[]');
      const dropIds     = Array.isArray(t.dropPoints)
        ? t.dropPoints
        : JSON.parse(t.dropPoints || '[]');

      const pickupIdInt = pickupPoint ? parseInt(pickupPoint) : null;
      const dropIdInt   = dropPoint   ? parseInt(dropPoint)   : null;

      if (pickupIdInt && !pickupIds.includes(pickupIdInt)) continue;
      if (dropIdInt   && !dropIds.includes(dropIdInt))     continue;

      // ── Booked seats for this date ────────────────────────────────────────
      const bookingsForDate = await Booking.findAll({
        where: {
          tripId:        t.id,
          journeyDate:   searchDate,
          bookingStatus: { [Op.not]: 'cancelled' }
        },
        attributes: ['seats']
      });

      const bookedSeatNumbers = bookingsForDate.flatMap(b => {
        try {
          const parsed = typeof b.seats === 'string'
            ? JSON.parse(b.seats)
            : (b.seats || []);
          return parsed.map(s => s.seatNumber || s.seat_number || s);
        } catch { return []; }
      });

      const seatsInfo = (t.seats || []).map(seat => ({
        id:         seat.id,
        seatNumber: seat.seatNumber,
        seatType:   seat.seatType,
        price:      seat.price,
        isBooked:   bookedSeatNumbers.includes(seat.seatNumber),
      }));

      const leftSeats = seatsInfo.filter(s => !s.isBooked);

      // ── ✅ FIX 3: displayPrice correctly derived per cabType ───────────────
      // const displayPrice = getDisplayPrice(t.Car);
      const startId = t.startLocationId || t.dataValues?.startLocationId;
      let displayPrice = getDisplayPrice(t.Car);   // fallback

      if (startId) {
        const defaultPickup = await PickupPoint.findOne({
          where: {
            startLocationId: startId,
            isCityDefault: true,
            status: 1,
            price: { [Op.not]: null },
            endLocationId: t.endLocationId,
          },
          
          order: [['price', 'ASC']],   // cheapest default first
          raw: true,
        });
        if (defaultPickup?.price) {
          displayPrice = Math.min(
            displayPrice,
            parseFloat(defaultPickup.price)
          );
        }
      }

      // ── ✅ FIX 4: Price filter ─────────────────────────────────────────────
      if (minPrice && displayPrice < parseFloat(minPrice)) continue;
      if (maxPrice && displayPrice > parseFloat(maxPrice)) continue;

      // ── ✅ FIX 5: minSeats filter ──────────────────────────────────────────
      // For sharing: count available seats
      // For cabin: count available cabins (totalCabins - bookedCabins)
      const cabType = t.Car?.cabType;
      if (minSeats) {
        const minSeatsInt = parseInt(minSeats);
        if (cabType === 'cabin') {
          // Count distinct cabinNumbers already booked on this date
          const cabinBookings = await Booking.findAll({
            where: {
              tripId:        t.id,
              journeyDate:   searchDate,
              bookingType:   'cabin',
              bookingStatus: { [Op.not]: 'cancelled' }
            },
            attributes: ['cabinNumber']
          });
          const bookedCabins    = new Set(cabinBookings.map(b => b.cabinNumber)).size;
          const availableCabins = (t.Car?.totalCabins || 0) - bookedCabins;
          if (availableCabins < minSeatsInt) continue;
        } else {
          // Sharing: leftSeats count
          if (leftSeats.length < minSeatsInt) continue;
        }
      }

      // ── ✅ FIX 6: Time range filter ────────────────────────────────────────
      if (timeRange) {
        const tripTime = new Date(t.startTime);
        // Convert UTC to IST (+5:30)
        const istHour  = (tripTime.getUTCHours() + 5.5) % 24;

        const isMorning   = istHour >= 6  && istHour < 12;
        const isAfternoon = istHour >= 12 && istHour < 17;
        const isEvening   = istHour >= 17 && istHour < 21;
        const isNight     = istHour >= 21 || istHour < 6;

        const matchesTime =
          (timeRange === 'morning'   && isMorning)   ||
          (timeRange === 'afternoon' && isAfternoon) ||
          (timeRange === 'evening'   && isEvening)   ||
          (timeRange === 'night'     && isNight);

        if (!matchesTime) continue;
      }

      // ── Pickup points — filtered by cabType ──────────────────────────────
    // ✅ REPLACE WITH — trip specific + startLocation defaults, no city logic
const tripCabType  = t.Car?.cabType || 'sharing';
const idsToFetch   = pickupIdInt ? [pickupIdInt] : pickupIds;

// 1. Trip-specific pickup points (assigned to this trip)
const specificPickups = idsToFetch.length > 0
  ? await PickupPoint.findAll({
      where: {
        id:     idsToFetch,
        isCityDefault:false,
        status: 1,
        [Op.or]: [{ cabType: tripCabType }, { cabType: 'all' }],
      },
      attributes: ['id', 'name', 'price', 'type', 'description', 'meta', 'cabType', 'isCityDefault'],
      raw: true,
    })
  : [];

// 2. Admin-configured default pickup points for this startLocation
//    Fetched by startLocationId — NO city column needed
// ✅ FIX — route-specific: match startLocationId + endLocationId
// Also fetch startLocation-only defaults (endLocationId = null) as fallback
const defaultPickups = await PickupPoint.findAll({
  where: {
    startLocationId: t.startLocationId,
    isCityDefault:   true,
    status:          1,
    [Op.or]: [{ cabType: tripCabType }, { cabType: 'all' }],
    // Route-specific OR start-location-only (null = applies to all routes)
    [Op.and]: [{
     endLocationId: t.endLocationId,
    }]
  },
  attributes: ['id', 'name', 'price', 'type', 'description', 'meta', 'cabType', 'isCityDefault', 'endLocationId'],
  raw: true,
  // ✅ Route-specific points take priority over start-location-wide ones
  order: [
    // endLocationId set = route-specific → comes first
    [sequelize.literal('CASE WHEN end_location_id IS NOT NULL THEN 0 ELSE 1 END'), 'ASC'],
    ['id', 'ASC']
  ],
});

// ✅ Dedup: if same-named point exists for both route-specific and start-location-wide,
// keep only the route-specific one
const routeSpecific    = defaultPickups.filter(p => p.endLocationId != null);
const startLocationOnly = defaultPickups.filter(p => p.endLocationId == null);
const routeSpecificIds  = new Set(routeSpecific.map(p => p.id));

// Only include start-location-wide if no route-specific version exists
const mergedDefaults = [
  ...routeSpecific,
  ...startLocationOnly.filter(p => !routeSpecificIds.has(p.id)),
];

// Use mergedDefaults instead of defaultPickups in the merge step
const seenIds = new Set();
const mergedPickupPoints = [...mergedDefaults, ...specificPickups]
  .filter(p => {
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  })
  .map(p => ({
    id:            p.id,
    name:          p.name,
    price:         p.price != null ? parseFloat(p.price) : getDisplayPrice(t.Car),
    description:   p.description   || null,
    meta:          p.meta          || null,
    isCityDefault: p.isCityDefault || false,
    cabType:       p.cabType       || 'all',
  }));

      // ── Drop points ───────────────────────────────────────────────────────
      const dropPointsArr = await fetchPointNames(
        dropIdInt ? [dropIdInt] : dropIds,
        DropPoint
      );

      // defaultPickups fetch ke baad
console.log('=== PICKUP DEBUG ===');
console.log('startLocationId:', t.startLocationId);
console.log('tripCabType:', tripCabType);
console.log('defaultPickups count:', defaultPickups.length);
console.log('defaultPickups:', JSON.stringify(defaultPickups));
console.log('specificPickups count:', specificPickups.length);
console.log('merged count:', mergedPickupPoints.length);

      // ── Cabin booking info ────────────────────────────────────────────────
      let bookedCabinNumbers = [];
      if (cabType === 'cabin') {
        const cabinBookings = await Booking.findAll({
          where: {
            tripId:        t.id,
            journeyDate:   searchDate,
            bookingType:   'cabin',
            bookingStatus: { [Op.not]: 'cancelled' }
          },
          attributes: ['cabinNumber']
        });
        bookedCabinNumbers = cabinBookings.map(b => b.cabinNumber);
      }

      const totalCabins     = t.Car?.totalCabins || 0;
      const availableCabins = cabType === 'cabin'
        ? totalCabins - new Set(bookedCabinNumbers).size
        : null;

      filteredTrips.push({
        id:             t.id,
        startLocation:  t.startLocation,
        endLocation:    t.endLocation,
        startTime:      t.startTime,
        endTime:        t.endTime,
        duration:       t.duration,
        isRecurring:    t.isRecurring || false,
        availableSeats: leftSeats.length,
        availableCabins,
        bookedCabinNumbers,
        seatsInfo,
        pickupPoints:   mergedPickupPoints,
        dropPoints:     dropPointsArr,
        meals:          t.meals || [],
        carInfo: {
          id:                 t.Car?.id,
          name:               t.Car?.carName,
          type:               t.Car?.carType,
          class:              t.Car?.class,
          totalSeats:         t.Car?.totalSeats,
          registrationNumber: t.Car?.registrationNumber,
          carUniqueNumber:    t.Car?.carUniqueNumber,
          cabType:            t.Car?.cabType,
          pricePerSeat:       t.Car?.pricePerSeat,
          pricePerCabin:      t.Car?.pricePerCabin,
          cabinCapacity:      t.Car?.cabinCapacity,
          totalCabins:        t.Car?.totalCabins,
          pricePerCar:        t.Car?.pricePerCar,
          imageUrl:           t.Car?.imageUrl,
        },
        displayPrice,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      });
    }

    // ── ✅ FIX 7: Sorting ──────────────────────────────────────────────────────
    if (sortBy === 'priceLowHigh') {
      filteredTrips.sort((a, b) => a.displayPrice - b.displayPrice);
    } else if (sortBy === 'priceHighLow') {
      filteredTrips.sort((a, b) => b.displayPrice - a.displayPrice);
    } else if (sortBy === 'departureEarliest') {
      filteredTrips.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    } else if (sortBy === 'departureLatest') {
      filteredTrips.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    }

    return filteredTrips;

  } catch (error) {
    console.error('[searchTrips] Unexpected error:', error);
    throw new Error('Failed to search for trips. Please try again later.');
  }
},
 searchPersonalizeTrips : async (queryParams = {}) => {
  try {
    // ── CHANGE 1: destructure carType ─────────────────────────────────────────
    let { startLocation, endLocation, date, carType } = queryParams;
 
    // ── 1. Validate required params ───────────────────────────────────────────
    if (!startLocation || !endLocation) {
      return { error: true, message: 'startLocation and endLocation are required' };
    }
 
    if (!date || date.trim() === '') {
      return { error: true, message: 'Date is required. Use format YYYY-MM-DD' };
    }
 
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date.trim())) {
      return { error: true, message: 'Invalid date format. Use YYYY-MM-DD' };
    }
 
    const parsedDate = new Date(date + 'T00:00:00.000Z');
    if (isNaN(parsedDate.getTime())) {
      return { error: true, message: 'Invalid date. Use YYYY-MM-DD' };
    }
 
    const searchDate = date.trim();
 
    // ── CHANGE 2: build Car where clause dynamically ──────────────────────────
    const carWhere = { cabType: 'personalize' };
    if (carType && carType.trim() !== '') {
      // DB column is carType, values: 'Hatchback', 'Sedan', 'SUV', etc.
      // Use Op.iLike for case-insensitive match, or just lowercase both sides:
      carWhere.carType = carType.trim()
        .replace(/^\w/, c => c.toUpperCase()); // 'sedan' → 'Sedan' to match DB casing
      // If your DB stores lowercase, just use: carWhere.carType = carType.trim().toLowerCase();
    }
 
    console.log('[searchPersonalizeTrips] carWhere:', carWhere);
 
    // ── 2. Fetch trips ────────────────────────────────────────────────────────
    const trips = await Trip.findAll({
      where: {
        status:            true,
        start_location_id: parseInt(startLocation),
        end_location_id:   parseInt(endLocation),
      },
      include: [
        {
          model: Car,
          where: carWhere,                    // ← dynamic — includes carType when sent
          attributes: [
            'id', 'carName', 'carType', 'class', 'totalSeats',
            'carUniqueNumber', 'registrationNumber',
            'pricePerCar', 'imageUrl'
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
        }
      ],
      attributes: [
        'id', 'start_time', 'end_time', 'duration', 'status',
        'pickup_points', 'drop_points', 'meals', 'is_recurring',
        'is_fully_booked', 'created_at', 'updated_at',
        'car_id', 'start_location_id', 'end_location_id'
      ],
      order: [['start_time', 'ASC']]
    });
 
    console.log(`[searchPersonalizeTrips] Total personalize trips found: ${trips.length}`);
 
    // ── 3. Filter loop — UNCHANGED from your original ─────────────────────────
    const availableTrips = [];
 
    for (const t of trips) {
 
      console.log(t?.dataValues?.start_time);
 
      if (!t?.dataValues?.start_time || isNaN(new Date(t?.dataValues?.start_time).getTime())) {
        console.log(`[searchPersonalizeTrips] Skipping trip ${t.id} — invalid start_time`);
        continue;
      }
 
      const tripDateStr = new Date(t?.dataValues?.start_time).toISOString().split('T')[0];
 
      if (t.dataValues.is_recurring) {
        if (searchDate < tripDateStr) {
          console.log(`[searchPersonalizeTrips] Skipping trip ${t.id} — search date before trip start`);
          continue;
        }
      } else {
        if (tripDateStr !== searchDate) {
          console.log(`[searchPersonalizeTrips] Skipping trip ${t.id} — date mismatch`);
          continue;
        }
      }
 
      const existingBooking = await Booking.findOne({
        where: {
          tripId:        t.id,
          journeyDate:   searchDate,
          bookingType:   'personalize',
          bookingStatus: { [Op.not]: 'cancelled' }
        },
        attributes: ['id']
      });
 
      if (existingBooking) {
        console.log(`[searchPersonalizeTrips] Skipping trip ${t.id} — already booked for ${searchDate}`);
        continue;
      }
 
      const pickupIds = Array.isArray(t.dataValues.pickup_points)
        ? t.dataValues.pickup_points
        : JSON.parse(t.dataValues.pickup_points || '[]');
 
      const dropIds = Array.isArray(t.dataValues.drop_points)
        ? t.dataValues.drop_points
        : JSON.parse(t.dataValues.drop_points || '[]');
 
      const [pickupPoints, dropPoints] = await Promise.all([
        pickupIds.length > 0 ? PickupPoint.findAll({ where: { id: pickupIds }, attributes: ['id', 'name'] }) : [],
        dropIds.length > 0   ? DropPoint.findAll({  where: { id: dropIds   }, attributes: ['id', 'name'] }) : []
      ]);
 
      availableTrips.push({
        id:            t.id,
        startLocation: t.dataValues.startLocation,
        endLocation:   t.dataValues.endLocation,
        startTime:     t.dataValues.start_time,
        endTime:       t.dataValues.end_time,
        duration:      t.dataValues.duration,
        isRecurring:   t.dataValues.is_recurring || false,
        meals:         t.dataValues.meals || [],
        pickupPoints:  pickupPoints.map(p => ({ id: p.id, name: p.name })),
        dropPoints:    dropPoints.map(d => ({ id: d.id, name: d.name })),
        carInfo: {
          id:                 t.dataValues.Car?.id,
          name:               t.dataValues.Car?.carName,
          type:               t.dataValues.Car?.carType,
          class:              t.dataValues.Car?.class,
          totalSeats:         t.dataValues.Car?.totalSeats,
          registrationNumber: t.dataValues.Car?.registrationNumber,
          carUniqueNumber:    t.dataValues.Car?.carUniqueNumber,
          cabType:            'personalize',
          pricePerCar:        t.dataValues.Car?.pricePerCar,
          imageUrl:           t.dataValues.Car?.imageUrl,
        },
        price:    parseFloat(t.dataValues.Car?.pricePerCar || 0),
        createdAt: t.dataValues.created_at,
      });
    }
 
    console.log(`[searchPersonalizeTrips] Available trips after filtering: ${availableTrips.length}`);
 
    availableTrips.sort((a, b) => a.price - b.price);
 
    return availableTrips;
 
  } catch (error) {
    console.error('[searchPersonalizeTrips] Error:', error);
    throw new Error('Failed to search personalize trips. Please try again.');
  }
},


  getSeatsForTrip: async (tripId, journeyDate = null) => {
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

    if (!trip) throw new NotFound('Trip not found');

    if (!journeyDate) return trip.seats || [];

    if (!trip.isRecurring) {
      const tripDate = new Date(trip.startTime).toISOString().split('T')[0];
      if (journeyDate !== tripDate) {
        throw new Error('This is a one-time trip and is only available on ' + tripDate);
      }
    } else {
      const tripStartDate = new Date(trip.startTime).toISOString().split('T')[0];
      if (journeyDate < tripStartDate) {
        throw new Error('Journey date cannot be before the trip start date');
      }
    }

    const bookings = await Booking.findAll({
      where: { tripId, journeyDate: new Date(journeyDate) },
      raw: true
    });

    const bookedSeatIds = new Set();
    bookings.forEach(booking => {
      try {
        const seats = JSON.parse(booking.seats);
        seats.forEach(seat => bookedSeatIds.add(seat.seatId));
      } catch (e) {
        console.error('Error parsing seats for booking:', booking.id, e);
      }
    });

    return trip.seats.map(seat => ({
      ...seat.get({ plain: true }),
      isBooked: bookedSeatIds.has(seat.id) || seat.isBooked
    }));
  },

  deleteTrip: async (id) => {
    const trip = await tripService.getTripById(id);
    await SeatPricing.destroy({ where: { tripId: id } });
      await Seat.destroy({ where: { tripId: id } });
    await BookedSeat.destroy({ where: { tripId: id } });
    await Booking.destroy({ where: { tripId: id } });
    await Trip.destroy({ where: { id } });
    return { message: 'Trip deleted successfully' };
  },
  syncTripGroup: async (tripGroupId, newStartTimes = [], newEndTime, sharedData) => {
  return await sequelize.transaction(async (transaction) => {

    // ── Fetch all existing trips in this group ────────────────────────────
    const existingTrips = await Trip.findAll({
      where: { tripGroupId },
      order: [['startTime', 'ASC']],
      transaction,
    });

    if (!existingTrips.length) {
      throw new NotFoundError('No trips found for this group');
    }

    // Use first trip as the source of truth for shared fields
    const baseTrip = existingTrips[0];

    // ── Normalize times to "HH:MM" for comparison ─────────────────────────
    // DB times like "2026-03-31T09:00:00.000Z" → "09:00"
    const toHHMM = (datetimeStr) => {
      const d = new Date(datetimeStr);
      return d.toTimeString().slice(0, 5); // "HH:MM"
    };

    // Build a map: "HH:MM" → Trip instance
    const existingMap = new Map();
    for (const trip of existingTrips) {
      existingMap.set(toHHMM(trip.startTime), trip);
    }

    // Normalize incoming startTimes → extract HH:MM from full datetime strings
    // newStartTimes = ["2026-03-31 10:00:00", "2026-03-31 16:00:00"]
    const newTimesMap = new Map(); // "HH:MM" → full datetime string
    for (const t of newStartTimes) {
      const d = new Date(t);
      const hhmm = d.toTimeString().slice(0, 5);
      newTimesMap.set(hhmm, t);
    }

    const existingKeys = new Set(existingMap.keys()); // {"09:00","11:00","14:00","16:00"}
    const newKeys      = new Set(newTimesMap.keys()); // {"10:00","16:00"}

    // ── Compute diff ──────────────────────────────────────────────────────
    const toDelete = [...existingKeys].filter(t => !newKeys.has(t)); // ["09:00","11:00","14:00"]
    const toCreate = [...newKeys].filter(t => !existingKeys.has(t)); // ["10:00"]
    const toKeep   = [...existingKeys].filter(t => newKeys.has(t));  // ["16:00"]

    // ── Duration calculation (same pattern as createTripWithSeats) ────────
    // newEndTime is for the FIRST departure, so duration is fixed
    const firstNewStartTime = newStartTimes[0] ? new Date(newStartTimes[0]) : null;
    const endTimeDt = newEndTime ? new Date(newEndTime) : null;

    const getDuration = (startDt) => {
      if (!firstNewStartTime || !endTimeDt) return baseTrip.duration;
      const durationMs = endTimeDt - firstNewStartTime;
      const tripEndDt = new Date(startDt.getTime() + durationMs);
      return calculateDuration(startDt, tripEndDt);
    };

    const getTripEndTime = (startDt) => {
      if (!firstNewStartTime || !endTimeDt) return baseTrip.endTime;
      const durationMs = endTimeDt - firstNewStartTime;
      return new Date(startDt.getTime() + durationMs);
    };

    // ── Step 1: DELETE removed trips ──────────────────────────────────────
    let deletedCount = 0;
    for (const hhmm of toDelete) {
      const trip = existingMap.get(hhmm);
      // Clean up related records first
      await SeatPricing.destroy({ where: { tripId: trip.id }, transaction });
      await BookedSeat.destroy({ where: { tripId: trip.id }, transaction });
      await Booking.destroy({ where: { tripId: trip.id }, transaction });
      await Seat.destroy({ where: { tripId: trip.id }, transaction });
      await Trip.destroy({ where: { id: trip.id }, transaction });
      deletedCount++;
    }

    // ── Step 2: UPDATE kept trips with new shared data ────────────────────
    let keptCount = 0;
    for (const hhmm of toKeep) {
      const trip = existingMap.get(hhmm);
      const startDt = new Date(newTimesMap.get(hhmm)); // same time, possibly new date

      const updatePayload = {
        ...buildSharedUpdateData(sharedData),
        startTime: startDt,
        endTime:   getTripEndTime(startDt),
        duration:  getDuration(startDt),
      };

      await trip.update(updatePayload, { transaction });

      // Update seats if seatsInfo provided
      if (sharedData.seatsInfo?.length) {
        await syncSeats(trip.id, sharedData.seatsInfo, trip.carId, transaction);
      }

      keptCount++;
    }

    // ── Step 3: CREATE new trips ──────────────────────────────────────────
    const car = await Car.findByPk(sharedData.carId || baseTrip.carId, { transaction });
    if (!car) throw new BadRequestError('Car not found');
    const seatPrice = getSeatPriceFromCar(car);

    let createdCount = 0;
    for (const hhmm of toCreate) {
      const fullDatetime = newTimesMap.get(hhmm);
      const startDt = new Date(fullDatetime);

      // Check for duplicate (same car + same time already exists outside this group)
      const duplicate = await Trip.findOne({
        where: {
          carId: car.id,
          startTime: startDt,
          tripGroupId: { [Op.ne]: tripGroupId }, // allow within same group
        },
        transaction,
      });
      if (duplicate) {
        throw new ConflictError(`A trip already exists for this car at ${fullDatetime}`);
      }

      const newTrip = await Trip.create({
        // Inherit all shared fields from base trip
        startLocationId: sharedData.startLocationId || baseTrip.startLocationId,
        endLocationId:   sharedData.endLocationId   || baseTrip.endLocationId,
        pickupPoints:    sharedData.pickupPoints     || baseTrip.pickupPoints,
        dropPoints:      sharedData.dropPoints       || baseTrip.dropPoints,
        carId:           car.id,
        startTime:       startDt,
        endTime:         getTripEndTime(startDt),
        duration:        getDuration(startDt),
        status:          sharedData.status ?? baseTrip.status,
        isRecurring:     baseTrip.isRecurring,
        repeatType:      baseTrip.repeatType,
        meals:           sharedData.meals || baseTrip.meals,
        tripGroupId,     // ← same group ID — Rule 3
      }, { transaction });

      // Create seats for new trip — copy structure from base trip's seats
      const baseSeats = sharedData.seatsInfo?.length
        ? sharedData.seatsInfo
        : await Seat.findAll({ where: { tripId: baseTrip.id }, transaction });

      await Seat.bulkCreate(
        baseSeats.map(seat => ({
          seatNumber: seat.seatNumber,
          seatType:   seat.seatType || 'middle',
          tripId:     newTrip.id,
          price:      seatPrice,
          isBooked:   false,
        })),
        { transaction }
      );

      createdCount++;
    }

    return {
      tripGroupId,
      kept:    keptCount,
      created: createdCount,
      deleted: deletedCount,
      total:   keptCount + createdCount,
    };
  });
},
};

// Filters only the fields that should be applied to all trips in a group update
const buildSharedUpdateData = (sharedData) => {
  const allowed = [
    'startLocationId', 'endLocationId', 'pickupPoints',
    'dropPoints', 'carId', 'status', 'meals',
    'isRecurring', 'repeatType',
  ];
  return Object.fromEntries(
    Object.entries(sharedData).filter(([k]) => allowed.includes(k))
  );
};

// Syncs seats for a kept trip when seatsInfo is updated
const syncSeats = async (tripId, seatsInfo, carId, transaction) => {
  const car = await Car.findByPk(carId, { transaction });
  const seatPrice = getSeatPriceFromCar(car);
  const existingSeats = await Seat.findAll({ where: { tripId }, transaction });
  const seatMap = new Map(existingSeats.map(s => [s.seatNumber, s]));

  for (const seatData of seatsInfo) {
    if (seatMap.has(seatData.seatNumber)) {
      await seatMap.get(seatData.seatNumber).update({
        seatType: seatData.seatType || 'middle',
        price: seatPrice,
      }, { transaction });
    }
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// Helper: derive seat price from car based on cab type
// ─────────────────────────────────────────────────────────────────────────────
function getSeatPriceFromCar(car) {
  if (!car) return 0;
  if (car.cabType === 'sharing')     return parseFloat(car.pricePerSeat)  || 0;
  if (car.cabType === 'cabin')       return parseFloat(car.pricePerCabin) || 0;
  if (car.cabType === 'personalize') return parseFloat(car.pricePerCar)   || 0;
  return parseFloat(car.pricePerSeat) || 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: get the display price for a car (what to show user / use for sorting)
// ─────────────────────────────────────────────────────────────────────────────
function getDisplayPrice(car) {
  if (!car) return 0;
  if (car.cabType === 'sharing')     return parseFloat(car.pricePerSeat)  || 0;
  if (car.cabType === 'cabin')       return parseFloat(car.pricePerCabin) || 0;
  if (car.cabType === 'personalize') return parseFloat(car.pricePerCar)   || 0;
  return parseFloat(car.pricePerSeat) || 0;
}

module.exports = tripService;
// const { 
//   Trip, 
//   Car, 
//   Seat, 
//   StartLocation, 
//   EndLocation, 
//   SeatPricing, 
//   PickupPoint, 
//   DropPoint, 
//   BookedSeat, 
//   Booking, 
//   Meal, 
//   sequelize 
// } = require('../db/models');
// const { Op, Sequelize } = require('sequelize');
// const { NotFound } = require('http-errors');
// const { BadRequestError, ConflictError } = require('../utils/errors');
// const { calculateDuration, toIST, nowIST, toISTString, toISTLuxon } = require('../utils/dateUtils');

// const tripService = {
//   createTrip: async (data, options = {}) => {
//     // Create a copy of the data to avoid modifying the original
//     const tripData = { ...data };
    
//     // Convert dates to Date objects if they're strings
//     if (tripData.startTime && typeof tripData.startTime === 'string') {
//       tripData.startTime = new Date(tripData.startTime);
//     }
//     if (tripData.endTime && typeof tripData.endTime === 'string') {
//       tripData.endTime = new Date(tripData.endTime);
//     }
    
//     // Calculate duration if both times are provided
//     if (tripData.startTime && tripData.endTime) {
//       tripData.duration = calculateDuration(tripData.startTime, tripData.endTime);
//     }
    
//     return await Trip.create(tripData, options);
//   },
//   findTripByCarAndDate: async (carId, startTime) => {
//     // Convert input to Date object if it's a string
//     const tripStart = typeof startTime === 'string' ? new Date(startTime) : startTime;
    
//     return await Trip.findOne({
//       where: {
//         carId,
//         [Op.or]: [
//           // New trip starts during existing trip
//           {
//             startTime: { [Op.lte]: tripStart },
//             endTime: { [Op.gt]: tripStart }
//           },
//           // New trip ends during existing trip
//           {
//             startTime: { [Op.lt]: tripStart },
//             endTime: { [Op.gte]: tripStart }
//           },
//           // New trip completely contains existing trip
//           {
//             startTime: { [Op.gte]: tripStart },
//             endTime: { [Op.lte]: tripStart }
//           }
//         ]
//       },
//     });
//   },

//   // createTripWithSeats: async (tripData, seats, meals = []) => {
//   //   return await sequelize.transaction(async (transaction) => {
//   //     // Check if trip already exists for same car and date range
//   //     const existingTrip = await tripService.findTripByCarAndDate(
//   //       tripData.carId,
//   //       tripData.startTime
//   //     );
      
//   //     if (existingTrip) {
//   //       throw new ConflictError('A trip already exists for this car during the selected time period');
//   //     }
      
//   //     // Calculate duration
//   //     const duration = calculateDuration(new Date(tripData.startTime), new Date(tripData.endTime));

//   //     // Validate seats
//   //     if (!seats || !Array.isArray(seats) || seats.length === 0) {
//   //       throw new BadRequestError('At least one seat is required');
//   //     }

//   //     // Validate each seat
//   //     seats.forEach((seat, index) => {
//   //       if (!seat.seatNumber) {
//   //         throw new BadRequestError(`Seat at index ${index} is missing required field (seatNumber)`);
//   //       }
//   //     });

//   //     // Validate meals if they exist
//   //     if (meals && meals.length > 0) {
//   //       meals.forEach((meal, index) => {
//   //         if (!meal.type || typeof meal.price !== 'number') {
//   //           throw new BadRequestError(`Meal at index ${index} is missing required fields (type, price)`);
//   //         }
//   //       });
//   //     }

//   //     // Prepare trip data with calculated duration and meals
//   //     const tripToCreate = {
//   //       ...tripData,
//   //       duration,
//   //       meals: meals.length > 0 ? meals : null
//   //     };
      
//   //     // Create the trip with meals data
//   //     const trip = await tripService.createTrip(tripToCreate, { transaction });

//   //     // Get the car to derive pricing
//   //     const car = await Car.findByPk(tripData.carId, { transaction });
//   //     if (!car) {
//   //       throw new BadRequestError('Car not found');
//   //     }

//   //     // Create seats with tripId and prices derived from car
//   //     const seatData = seats.map(seat => ({
//   //       ...seat,
//   //       tripId: trip.id,
//   //       price: car.pricePerSeat || 0, // Derive price from car
//   //       isBooked: false
//   //     }));
//   //     await Seat.bulkCreate(seatData, { transaction });
//   //     return trip;
//   //   });
//   // },


//   // ─────────────────────────────────────────────────────────────────────────
//   // createTripWithSeats
//   // Price is now ALWAYS derived from the car — not passed from frontend
//   // For sharing:     each seat gets car.pricePerSeat
//   // For cabin:       each seat gets car.pricePerCabin (price per cabin unit)
//   // For personalize: each seat gets car.pricePerCar (flat, whole car)
//   // ─────────────────────────────────────────────────────────────────────────
//   createTripWithSeats: async (tripData, seats, meals = []) => {
//     return await sequelize.transaction(async (transaction) => {
//       // Check for duplicate trip
//       const existingTrip = await tripService.findTripByCarAndDate(
//         tripData.carId,
//         tripData.startTime
//       );
 
//       if (existingTrip) {
//         throw new ConflictError('A trip already exists for this car during the selected time period');
//       }
 
//       // Calculate duration
//       const duration = calculateDuration(new Date(tripData.startTime), new Date(tripData.endTime));
 
//       // Validate seats
//       if (!seats || !Array.isArray(seats) || seats.length === 0) {
//         throw new BadRequestError('At least one seat is required');
//       }
 
//       seats.forEach((seat, index) => {
//         if (!seat.seatNumber) {
//           throw new BadRequestError(`Seat at index ${index} is missing seatNumber`);
//         }
//       });
 
//       // Validate meals
//       if (meals && meals.length > 0) {
//         meals.forEach((meal, index) => {
//           if (!meal.type || typeof meal.price !== 'number') {
//             throw new BadRequestError(`Meal at index ${index} is missing required fields (type, price)`);
//           }
//         });
//       }
 
//       // Get the car — we derive ALL pricing from here
//       const car = await Car.findByPk(tripData.carId, { transaction });
//       if (!car) {
//         throw new BadRequestError('Car not found');
//       }
 
//       // Determine seat price based on cab type
//       // sharing    → pricePerSeat (per individual seat)
//       // cabin      → pricePerCabin (per cabin unit)
//       // personalize→ pricePerCar (flat for whole car)
//       const seatPrice = getSeatPriceFromCar(car);
 
//       // Prepare trip data
//       const tripToCreate = {
//         ...tripData,
//         duration,
//         meals: meals.length > 0 ? meals : null
//       };
 
//       // Create the trip
//       const trip = await tripService.createTrip(tripToCreate, { transaction });
 
//       // Create seats — price always from car, seatType from frontend
//       const seatData = seats.map(seat => ({
//         seatNumber: seat.seatNumber,
//         seatType: seat.seatType || 'middle',
//         tripId: trip.id,
//         price: seatPrice,
//         isBooked: false
//       }));
 
//       await Seat.bulkCreate(seatData, { transaction });
 
//       return trip;
//     });
//   },

//   getAllTrips: async (query = {}) => {
//     const { pickupPoint, dropPoint, date, ...otherFilters } = query;
//     const where = { ...otherFilters };
    
//     // Add date filter if provided
//     if (date) {
//       const startOfDay = new Date(date);
//       startOfDay.setHours(0, 0, 0, 0);
      
//       const endOfDay = new Date(date);
//       endOfDay.setHours(23, 59, 59, 999);
      
//       where.startTime = {
//         [Op.between]: [startOfDay, endOfDay]
//       };
//     }
    
//     // First, get all distinct trip IDs that match the criteria
//     const tripIds = await Trip.findAll({
//       where,
//       attributes: ['id'],
//       raw: true
//     }).then(trips => trips.map(trip => trip.id));

//     if (tripIds.length === 0) {
//       return [];
//     }

//     // Then fetch the full trip data with includes
//     const trips = await Trip.findAll({
//       where: { id: { [Op.in]: tripIds } },
//       include: [
//         {
//           model: Car,
//           attributes: ['id', 'carName', 'carType', 'totalSeats', 'registrationNumber'],
//           required: true,
//         }
//       ],
//       attributes: ['id', 'pickupPoints', 'dropPoints', 'startTime', 'endTime', 'duration', 'status','created_at','updated_at'],
//       order: [['created_at', 'DESC']]
//     });

//     // Get all seat data for these trips
//     const allSeats = await Seat.findAll({
//       where: {
//         tripId: { [Op.in]: tripIds }
//       },
//       attributes: ['id', 'tripId', 'seatNumber', 'seatType', 'price', 'isBooked'],
//       raw: true
//     });

//     // Group seats by tripId
//     const seatsByTrip = allSeats.reduce((acc, seat) => {
//       if (!acc[seat.tripId]) {
//         acc[seat.tripId] = [];
//       }
//       acc[seat.tripId].push(seat);
//       return acc;
//     }, {});

//     // Process trips in parallel
//     const processedTrips = await Promise.all(trips.map(async (trip) => {
//       // Get seats for this trip
//       const seats = seatsByTrip[trip.id] || [];
//       // Parse JSON arrays if they're strings (MySQL might return them as strings)
//       const pickupPointIds = Array.isArray(trip.pickupPoints) 
//         ? trip.pickupPoints 
//         : JSON.parse(trip.pickupPoints || '[]');
      
//       const dropPointIds = Array.isArray(trip.dropPoints) 
//         ? trip.dropPoints 
//         : JSON.parse(trip.dropPoints || '[]');

//       // Fetch locations in parallel
//       const [pickupPoints, dropPoints] = await Promise.all([
//         pickupPointIds.length > 0 ? PickupPoint.findAll({
//           where: { 
//             id: pickupPointIds,
//             status: true
//           },
//           attributes: ['id', 'name'],
//           include: [{
//             model: StartLocation,
//             attributes: ['id', 'name'],
//             required: true
//           }],
//           raw: true,
//           nest: true
//         }) : [],
        
//         dropPointIds.length > 0 ? DropPoint.findAll({
//           where: { 
//             id: dropPointIds,
//             status: true
//           },
//           attributes: ['id', 'name'],
//           include: [{
//             model: EndLocation,
//             attributes: ['id', 'name'],
//             required: true
//           }],
//           raw: true,
//           nest: true
//         }) : []
//       ]);

//       // Process seats
//       const availableSeats = seats.filter(s => !s.isBooked).length;
//       const bookedSeats = seats.filter(s => s.isBooked).length;
//       // Use car price instead of seat prices
//       const minSeatPrice = trip.Car.pricePerSeat || 0;

//       // Apply filters if provided
//       if (pickupPoint && !pickupPoints.some(p => p.id == pickupPoint)) {
//         return null;
//       }
      
//       if (dropPoint && !dropPoints.some(p => p.id == dropPoint)) {
//         return null;
//       }

//       return {
//         id: trip.id,
//         pickupPoints: pickupPoints.map(p => ({
//           id: p.id,
//           name: p.name,
//           type: 'pickup',
//           startLocation: p.StartLocation
//         })),
//         dropPoints: dropPoints.map(d => ({
//           id: d.id,
//           name: d.name,
//           type: 'drop',
//           endLocation: d.EndLocation
//         })),
//         carInfo: trip.Car,
//         startTime: trip.startTime,
//         endTime: trip.endTime,
//         duration: trip.duration,
//         status: trip.status,
//         availableSeats,
//         bookedSeats,
//         minSeatPrice,
//         seatsInfo: seats,
//         created_at: trip.created_at,
//         updated_at: trip.updated_at
//         // startTime: toISTLuxon(trip.startTime),
//         // endTime: toISTLuxon(trip.endTime),
//         // created_at: toISTLuxon(trip.created_at),
//         // updated_at: toISTLuxon(trip.updated_at)

//       };
//     }));

//     // Filter out nulls (from filtering) and return
//     return processedTrips.filter(trip => trip !== null);
//   },
  

//   getTripById: async (id) => {
//     // First get the trip with basic info
//     const trip = await Trip.findByPk(id, {
//       include: [
//         {
//           model: Car,
//           attributes: ['id', 'carName', 'carType', 'totalSeats', 'registrationNumber', 'pricePerSeat', 'pricePerCabin', 'pricePerCar']
//         }
//       ],
//       attributes: ['id', 'pickupPoints', 'dropPoints', 'startTime', 'endTime', 'duration', 'status', 'meals']
//     });

//     if (!trip) {
//       throw new NotFound('Trip not found');
//     }

//     // Get seats separately to avoid issues with raw/nested data
//     const seats = await Seat.findAll({
//       where: { tripId: id },
//       attributes: ['id', 'seatNumber', 'seatType', 'price', 'isBooked'],
//       raw: true
//     });

//     // Ensure we have proper arrays for the IDs
//     const pickupPointIds = Array.isArray(trip.pickupPoints) 
//       ? trip.pickupPoints 
//       : (trip.pickupPoints ? JSON.parse(trip.pickupPoints) : []);
    
//     const dropPointIds = Array.isArray(trip.dropPoints) 
//       ? trip.dropPoints 
//       : (trip.dropPoints ? JSON.parse(trip.dropPoints) : []);

//     // Fetch locations in parallel
//     const [pickupPoints, dropPoints] = await Promise.all([
//       pickupPointIds.length > 0 ? PickupPoint.findAll({
//         where: { 
//           id: pickupPointIds,
//           status: true
//         },
//         attributes: ['id', 'name'],
//         include: [{
//           model: StartLocation,
//           attributes: ['id', 'name'],
//           required: true
//         }],
//         raw: true,
//         nest: true
//       }) : [],
      
//       dropPointIds.length > 0 ? DropPoint.findAll({
//         where: { 
//           id: dropPointIds,
//           status: true
//         },
//         attributes: ['id', 'name'],
//         include: [{
//           model: EndLocation,
//           attributes: ['id', 'name'],
//           required: true
//         }],
//         raw: true,
//         nest: true
//       }) : []
//     ]);

//     // Process seats
//     const availableSeats = seats.filter(s => !s.isBooked).length;
//     const bookedSeats = seats.filter(s => s.isBooked).length;
//     // Use car price instead of seat prices
//     const minSeatPrice = trip.Car.pricePerSeat || 0;

//     // Return the complete trip data
//     const result = {
//       ...trip.get({ plain: true }),
//       pickupPoints: pickupPoints.map(p => ({
//         id: p.id,
//         name: p.name,
//         type: 'pickup',
//         startLocation: p.StartLocation
//       })),
//       dropPoints: dropPoints.map(d => ({
//         id: d.id,
//         name: d.name,
//         type: 'drop',
//         endLocation: d.EndLocation
//       })),
//       carInfo: trip.Car,
//       availableSeats,
//       bookedSeats,
//       minSeatPrice,
//       seatsInfo: seats
//     };

//     // Remove the raw Car object if it exists
//     if (result.Car) {
//       delete result.Car;
//     }

//     return result;
//   },

//   updateTrip: async (id, data) => {
//     const transaction = await sequelize.transaction();
    
//     try {
//       // First get the trip as a model instance with a lock
//       const trip = await Trip.findByPk(id, { 
//         transaction,
//         lock: transaction.LOCK.UPDATE 
//       });
      
//       if (!trip) {
//         throw new Error('Trip not found');
//       }
      
//       const updateData = { ...data };
      
//       // Handle date conversions and duration calculation
//       if (updateData.startTime && typeof updateData.startTime === 'string') {
//         updateData.startTime = new Date(updateData.startTime);
//       }
//       if (updateData.endTime && typeof updateData.endTime === 'string') {
//         updateData.endTime = new Date(updateData.endTime);
//       }
      
//       if (updateData.startTime || updateData.endTime) {
//         const startTime = updateData.startTime || trip.startTime;
//         const endTime = updateData.endTime || trip.endTime;
//         updateData.duration = calculateDuration(new Date(startTime), new Date(endTime));
//       }
      
//       // Update the trip
//       await trip.update(updateData, { transaction });
      
//       // Handle seat updates if provided
//       if (data.seatsInfo && Array.isArray(data.seatsInfo)) {
//         // First, get all existing seats for this trip
//         const existingSeats = await Seat.findAll({
//           where: { tripId: id },
//           transaction
//         });
        
//         // Get the car to derive pricing for new seats
//         const car = await Car.findByPk(trip.carId, { transaction });
//         if (!car) {
//           throw new BadRequestError('Car not found');
//         }
        
//         // Create a map of existing seats by seatNumber for quick lookup
//         const seatMap = new Map(existingSeats.map(seat => [seat.seatNumber, seat]));
        
//         // Process each seat in the update
//         for (const seatData of data.seatsInfo) {
//           if (seatData.seatNumber && seatMap.has(seatData.seatNumber)) {
//             // Update existing seat
//             const seat = seatMap.get(seatData.seatNumber);
//             await seat.update({
//               seatType: seatData.seatType || seat.seatType,
//               price: seatData.price !== undefined ? seatData.price : seat.price,
//               // Don't update isBooked status here as it should be managed by bookings
//             }, { transaction });
//           } else if (seatData.seatNumber) {
//             // Create new seat if it doesn't exist
//             await Seat.create({
//               tripId: id,
//               seatNumber: seatData.seatNumber,
//               seatType: seatData.seatType || 'standard',
//               price: seatData.price || 0,
//               isBooked: false
//             }, { transaction });
//           }
//         }
//       }
      
//       // Handle meals update if provided
//       if (data.meals && Array.isArray(data.meals)) {
//         await trip.update({ meals: data.meals }, { transaction });
//       }
      
//       // Commit the transaction
//       await transaction.commit();
      
//       // Return the updated trip with all relationships
//       return await tripService.getTripById(id);
      
//     } catch (error) {
//       // If anything goes wrong, rollback the transaction
//       await transaction.rollback();
//       throw error;
//     }
//   },

//   /*
//   1st code
//   searchTrips: async (queryParams = {}) => {
//     try {
//       const {
//         startLocation,
//         endLocation,
//         date,
//         pickupPoint,
//         dropPoint,
//         minPrice,
//         maxPrice,
//         minSeats,
//         timeRange,
//         duration,
//         sortBy
//       } = queryParams;
  
//       const where = { status: true };
  
//       // Location filters
//       if (startLocation) where.start_location_id = parseInt(startLocation);
//       if (endLocation) where.end_location_id = parseInt(endLocation);
  
//       // Date filtering (IST-safe)
//       if (date) {
//         const [year, month, day] = date.split('-').map(Number);
//         const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
//         const endDate = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
//         where.start_time = { [Op.gte]: startDate, [Op.lt]: endDate };
//       } else {
//         where.start_time = { [Op.gte]: new Date() };
//       }
  
//       // Include seats
//       const includeSeats = {
//         model: Seat,
//         as: 'seats',
//         attributes: ['id', 'seat_number', 'price', 'status', 'seat_type'],
//         required: false
//       };
  
//       // Fetch trips
//       let trips = await Trip.findAll({
//         where,
//         attributes: [
//           'id',
//           'start_time',
//           'end_time',
//           'duration',
//           'status',
//           'pickup_points',
//           'drop_points',
//           'meals',
//           'created_at',
//           'updated_at',
//           'car_id',
//           'start_location_id',
//           'end_location_id'
//         ],
//         include: [
//           {
//             model: Car,
//             attributes: [
//               'id',
//               'carName',
//               'carType',
//               'class',
//               'totalSeats',
//               'carUniqueNumber',
//               'registrationNumber'
//             ],
//             required: true
//           },
//           {
//             model: StartLocation,
//             as: 'startLocation',
//             attributes: ['id', 'name'],
//             required: true
//           },
//           {
//             model: EndLocation,
//             as: 'endLocation',
//             attributes: ['id', 'name'],
//             required: true
//           },
//           includeSeats
//         ],
//         order: [['start_time', 'ASC']]
//       });
  
//       // Filter by pickup/drop if provided
//       if (pickupPoint || dropPoint) {
//         trips = trips.filter(trip => {
//           const tripData = trip.get({ plain: true });
//           const pArr = tripData.pickup_points || [];
//           const dArr = tripData.drop_points || [];
  
//           const matchPickup =
//             !pickupPoint || pArr.includes(parseInt(pickupPoint));
  
//           const matchDrop =
//             !dropPoint || dArr.includes(parseInt(dropPoint));
  
//           return matchPickup && matchDrop;
//         });
//       }
  
//       // Helper: fetch point names
//       async function fetchPointNames(ids, Model) {
//         if (!Array.isArray(ids) || ids.length === 0) return [];
//         const items = await Model.findAll({ where: { id: ids } });
//         return items.map(p => ({ id: p.id, name: p.name }));
//       }
  
//       // Final formatting
//       const finalTrips = [];
//       for (const trip of trips) {
//         const data = trip.get({ plain: true });
  
//         // seats
//         const seats = data.seats || [];
//         const availableSeats = seats.filter(s => s.status === "available");
//         const seatPrices = availableSeats.map(s => parseFloat(s.price) || 0);
//         const minSeatPrice = seatPrices.length ? Math.min(...seatPrices) : 0;
  
//         // pickup filter + fetch name
//         const pickupId = pickupPoint ? parseInt(pickupPoint) : null;
//         let pickupPoints = [];
//         if (pickupId && data.pickup_points.includes(pickupId)) {
//           pickupPoints = await fetchPointNames([pickupId], PickupPoint);
//         }
  
//         // drop filter + fetch name
//         const dropId = dropPoint ? parseInt(dropPoint) : null;
//         let dropPoints = [];
//         if (dropId && data.drop_points.includes(dropId)) {
//           dropPoints = await fetchPointNames([dropId], DropPoint);
//         }
  
//         // build final object
//         finalTrips.push({
//           id: data.id,
//           startLocation: data.startLocation,
//           endLocation: data.endLocation,
//           startTime: data.start_time,
//           endTime: data.end_time,
//           availableSeats: availableSeats.length,
//           pickupPoints: pickupPoints[0],
//           dropPoints: dropPoints[0],
//           meals: data.meals || [],
//           seatsInfo: seats,
//           carInfo: {
//             id: data.Car?.id,
//             name: data.Car?.carName,
//             type: data.Car?.carType,
//             class: data.Car?.class,
//             totalSeats: data.Car?.totalSeats,
//             carUniqueNumber: data.Car?.carUniqueNumber,
//             registrationNumber: data.Car?.registrationNumber
//           },
//           minSeatPrice,
//           createdAt: data.created_at,
//           updatedAt: data.updated_at
//         });
//       }
  
//       return finalTrips;
  
//     } catch (error) {
//       console.error("Error in searchTrips:", error);
//       throw new Error("Failed to search for trips. Please try again later.");
//     }
//   },
//   */
//   /* 2nd code*/
//   // searchTrips: async (queryParams = {}) => {
//   //   try {
//   //     const {
//   //       startLocation,
//   //       endLocation,
//   //       date,
//   //       pickupPoint,
//   //       dropPoint
//   //     } = queryParams;
  
//   //     const where = { status: true };
  
//   //     // Location filters
//   //     if (startLocation) where.start_location_id = parseInt(startLocation);
//   //     if (endLocation) where.end_location_id = parseInt(endLocation);
  
//   //     // Date filter (IST)
//   //     if (date) {
//   //       const [year, month, day] = date.split("-").map(Number);
//   //       const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
//   //       const endDate = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
  
//   //       where.start_time = {
//   //         [Op.gte]: startDate,
//   //         [Op.lt]: endDate
//   //       };
//   //     } else {
//   //       where.start_time = { [Op.gte]: new Date() };
//   //     }
  
//   //     // Include seats
//   //     const includeSeats = {
//   //       model: Seat,
//   //       as: "seats",
//   //       attributes: ["id", "seat_number", "price", "status", "seat_type"],
//   //       required: false
//   //     };
  
//   //     // Fetch trips
//   //     let trips = await Trip.findAll({
//   //       where,
//   //       attributes: [
//   //         "id",
//   //         "start_time",
//   //         "end_time",
//   //         "duration",
//   //         "status",
//   //         "pickup_points",
//   //         "drop_points",
//   //         "meals",
//   //         "created_at",
//   //         "updated_at",
//   //         "car_id",
//   //         "start_location_id",
//   //         "end_location_id"
//   //       ],
//   //       include: [
//   //         {
//   //           model: Car,
//   //           attributes: [
//   //             "id",
//   //             "carName",
//   //             "carType",
//   //             "class",
//   //             "totalSeats",
//   //             "carUniqueNumber",
//   //             "registrationNumber"
//   //           ],
//   //           required: true
//   //         },
//   //         {
//   //           model: StartLocation,
//   //           as: "startLocation",
//   //           attributes: ["id", "name"],
//   //           required: true
//   //         },
//   //         {
//   //           model: EndLocation,
//   //           as: "endLocation",
//   //           attributes: ["id", "name"],
//   //           required: true
//   //         },
//   //         includeSeats
//   //       ],
//   //       order: [["start_time", "ASC"]]
//   //     });
  
//   //     const pickupId = pickupPoint ? parseInt(pickupPoint) : null;
//   //     const dropId = dropPoint ? parseInt(dropPoint) : null;
  
//   //     // Filter by pickup & drop points only by ID validation
//   //     trips = trips.filter(trip => {
//   //       const data = trip.get({ plain: true });
  
//   //       const pickupArr = Array.isArray(data.pickup_points)
//   //         ? data.pickup_points
//   //         : [];
//   //       const dropArr = Array.isArray(data.drop_points)
//   //         ? data.drop_points
//   //         : [];
  
//   //       const pickupValid = !pickupId || pickupArr.includes(pickupId);
//   //       const dropValid = !dropId || dropArr.includes(dropId);
  
//   //       return pickupValid && dropValid;
//   //     });
  
//   //     // Fetch pickup/drop names only IF they match
//   //     let pickupPointRecord = null;
//   //     let dropPointRecord = null;
  
//   //     if (pickupId) {
//   //       pickupPointRecord = await PickupPoint.findOne({
//   //         where: { id: pickupId },
//   //         attributes: ["id", "name"]
//   //       });
//   //     }
  
//   //     if (dropId) {
//   //       dropPointRecord = await DropPoint.findOne({
//   //         where: { id: dropId },
//   //         attributes: ["id", "name"]
//   //       });
//   //     }
  
//   //     // Final formatting
//   //     return trips.map(trip => {
//   //       const t = trip.get({ plain: true });
  
//   //       const seats = t.seats || [];
  
//   //       const availableSeats = seats.filter(s => s.status === "available");
  
//   //       const seatPrices = availableSeats.map(s => parseFloat(s.price) || 0);
//   //       const minSeatPrice =
//   //         seatPrices.length > 0 ? Math.min(...seatPrices) : 0;
  
//   //       return {
//   //         id: t.id,
//   //         startLocation: t.startLocation?.name || "",
//   //         endLocation: t.endLocation?.name || "",
//   //         startTime: t.start_time,
//   //         endTime: t.end_time,
  
//   //         pickupPoint: pickupId && pickupPointRecord
//   //           ? { id: pickupPointRecord.id, name: pickupPointRecord.name }
//   //           : null,
  
//   //         dropPoint: dropId && dropPointRecord
//   //           ? { id: dropPointRecord.id, name: dropPointRecord.name }
//   //           : null,
  
//   //         availableSeats: availableSeats.length,
  
//   //         seatsInfo: seats.map(s => ({
//   //           id: s.id,
//   //           seatNumber: s.seat_number,
//   //           price: s.price,
//   //           seatType: s.seat_type,
//   //           isBooked: s.status !== "available"
//   //         })),
  
//   //         meals: t.meals || [],
  
//   //         carInfo: {
//   //           id: t.Car?.id,
//   //           name: t.Car?.carName,
//   //           type: t.Car?.carType,
//   //           class: t.Car?.class,
//   //           totalSeats: t.Car?.totalSeats,
//   //           registrationNumber: t.Car?.registrationNumber,
//   //           carUniqueNumber: t.Car?.carUniqueNumber
//   //         },
  
//   //         minSeatPrice,
  
//   //         createdAt: t.created_at,
//   //         updatedAt: t.updated_at
//   //       };
//   //     });
//   //   } catch (error) {
//   //     console.error("Error in searchTrips:", error);
//   //     throw new Error("Failed to search for trips. Please try again later.");
//   //   }
//   // },
  
//   searchTrips: async (queryParams = {}) => {
//     try {
//       const {
//         startLocation,
//         endLocation,
//         date,
//         pickupPoint,
//         dropPoint,
//         minPrice,
//         maxPrice,
//         minSeats,
//         timeRange,
//         sortBy
//       } = queryParams;
  
//       const where = { status: true };
  
//       if (startLocation) where.start_location_id = parseInt(startLocation);
//       if (endLocation) where.end_location_id = parseInt(endLocation);
  
//       let searchDate, nextDay;
//       if (date) {
//         const [year, month, day] = date.split("-").map(Number);
//         searchDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
//         nextDay = new Date(searchDate);
//         nextDay.setDate(nextDay.getDate() + 1);
        
//         // For non-recurring trips, match the exact date
//         // For recurring trips, we'll filter them later based on the day of week
//         where[Op.or] = [
//           // Non-recurring trips on the exact date
//           {
//             is_recurring: false,
//             start_time: {
//               [Op.gte]: searchDate,
//               [Op.lt]: nextDay
//             }
//           },
//           // Recurring trips (we'll filter by day of week later)
//           {
//             is_recurring: true,
//             start_time: { [Op.lt]: nextDay } // Only include recurring trips that have started
//           }
//         ];
//       } else {
//         where.start_time = { [Op.gte]: new Date() };
//       }
  
//       const includeSeats = {
//         model: Seat,
//         as: "seats",
//         attributes: ["id", "seat_number", "price", "status", "seat_type", "isBooked"],
//         required: false
//       };
  
//       let trips = await Trip.findAll({
//         where,
//         attributes: [
//           "id",
//           "start_time",
//           "end_time",
//           "duration",
//           "status",
//           "pickup_points",
//           "drop_points",
//           "meals",
//           "created_at",
//           "updated_at",
//           "car_id",
//           "start_location_id",
//           "end_location_id",
//           "is_recurring"
//         ],
//         include: [
//           {
//             model: Car,
//             attributes: [
//               "id",
//               "carName",
//               "carType",
//               "class",
//               "totalSeats",
//               "carUniqueNumber",
//               "registrationNumber"
//             ],
//             required: true
//           },
//           {
//             model: StartLocation,
//             as: "startLocation",
//             attributes: ["id", "name"],
//             required: true
//           },
//           {
//             model: EndLocation,
//             as: "endLocation",
//             attributes: ["id", "name"],
//             required: true
//           },
//           includeSeats
//         ]
//       });
  
//       // Filter by pickup & drop points and fetch names
//       const filteredTrips = [];
      
//       for (const trip of trips) {
//         const t = trip.get({ plain: true });
        
//         // For non-recurring trips, check if the date matches exactly
//         const tripDate = new Date(t.start_time);
//         const tripDay = tripDate.getDay();
//         const tripDateStr = tripDate.toISOString().split('T')[0];
        
//         if (t.is_recurring) {
//           const searchDateObj = new Date(date);
//           const isFutureOrSameDate = searchDateObj >= new Date(tripDateStr);
      
//           // DAILY RECURRING → always show for future dates
//           if (t.repeat_type === "daily") {
//               if (!isFutureOrSameDate) continue;
      
//               // adjust start time to selected date
//               const adjustedStart = new Date(
//                   searchDateObj.getFullYear(),
//                   searchDateObj.getMonth(),
//                   searchDateObj.getDate(),
//                   tripDate.getHours(),
//                   tripDate.getMinutes(),
//                   tripDate.getSeconds()
//               );
      
//               t.start_time = adjustedStart;
      
//               // adjust end time
//               if (t.duration) {
//                   const [hours, minutes] = t.duration.split(':').map(Number);
//                   const adjustedEnd = new Date(adjustedStart);
//                   adjustedEnd.setHours(adjustedStart.getHours() + hours,
//                                        adjustedStart.getMinutes() + minutes);
//                   t.end_time = adjustedEnd;
//               }
//           }
//       } else if (date && tripDateStr !== date) {
//           // For non-recurring trips, skip if the date doesn't match exactly
//           console.log(`Skipping non-recurring trip ${t.id} - date doesn't match (trip: ${tripDateStr}, search: ${date})`);
//           continue;
//         }
        
//         // const leftSeats = (t.seats || []).filter(s => s.isBooked === false);
//         const bookingsForDate = await Booking.findAll({
//           where: {
//               tripId: t.id,
//               journeyDate: date,
//               bookingStatus: { [Op.not]: 'cancelled' }
//           },
//           attributes: ['seats']
//       });
      
//       const bookedSeatIds = bookingsForDate.flatMap(b => b.seats || []);
      
//       const leftSeats = (t.seats || []).filter(s => !bookedSeatIds.includes(s.seat_number));
      
//         // const availableSeats = t.seats || [];
//         const seatsInfo = (t.seats || []).map(seat => ({
//           ...seat,
//           isBooked: bookedSeatIds.includes(seat.seat_number)
//          }));
      
//         const seatPrices = seatsInfo.map(s => parseFloat(s.price) || 0);
//         const minSeatPrice = seatPrices.length ? Math.min(...seatPrices) : 0;
  
//         const pickupIdInt = pickupPoint ? parseInt(pickupPoint) : null;
//         let pickupPointsArr = [];
//         if (pickupIdInt && t.pickup_points && t.pickup_points.includes(pickupIdInt)) {
//           pickupPointsArr = await fetchPointNames([pickupIdInt], PickupPoint);
//         }
  
//         const dropIdInt = dropPoint ? parseInt(dropPoint) : null;
//         let dropPointsArr = [];
//         if (dropIdInt && t.drop_points && t.drop_points.includes(dropIdInt)) {
//           dropPointsArr = await fetchPointNames([dropIdInt], DropPoint);
//         }
  
//         // Skip trip if pickup/drop point filter doesn't match
//         if ((pickupIdInt && pickupPointsArr.length === 0) || (dropIdInt && dropPointsArr.length === 0)) {
//           continue;
//         }
  
//         // Backend filters: price, seats, time
//         if (minPrice && minSeatPrice < minPrice) continue;
//         if (maxPrice && minSeatPrice > maxPrice) continue;
        
//         // Fix minSeats filter - count only available seats
//         if (minSeats) {
//           const availableSeatsCount = seatsInfo.filter(s => !s.isBooked).length;
//           if (availableSeatsCount < minSeats) continue;
//         }
  
//         // // Fix timeRange filter - handle IST timezone
//         // if (timeRange) {
//         //   // Create date in local timezone (IST)
//         //   const date = new Date(t.start_time);
//         //   // Get IST hours (UTC+5:30)
//         //   const istHour = (date.getUTCHours() + 5.5) % 24;
//         //   console.log('IST Hour:', istHour, 'UTC Time:', date.toISOString(), 'Time Range:', timeRange);
          
//         //   // Handle time ranges in IST
//         //   if (timeRange === "morning" && (istHour < 6 || istHour >= 12)) {
//         //     continue;
//         //   } else if (timeRange === "afternoon" && (istHour < 12 || istHour >= 17)) {
//         //     continue;
//         //   } else if (timeRange === "evening" && (istHour < 17 || istHour >= 21)) {
//         //     continue;
//         //   } else if (timeRange === "night" && !(istHour >= 21 || istHour < 6)) {
//         //     continue;
//         //   }
//         // }

//         if (timeRange) {
//           const date = new Date(t.start_time);
//           const istHour = (date.getUTCHours() + 5.5) % 24;
          
//           const isMorning   = istHour >= 6 && istHour < 12;
//           const isAfternoon = istHour >= 12 && istHour < 17;
//           const isEvening   = istHour >= 17 && istHour < 21;
//           const isNight     = istHour >= 21 || istHour < 6;
        
//           if (
//             (timeRange === "morning"   && !isMorning)   ||
//             (timeRange === "afternoon" && !isAfternoon) ||
//             (timeRange === "evening"   && !isEvening)   ||
//             (timeRange === "night"     && !isNight)
//           ) {
//             continue;
//           }
//         }
        
  
//         filteredTrips.push({
//           id: t.id,
//           startLocation: t.startLocation,
//           endLocation: t.endLocation,
//           startTime: t.start_time,
//           endTime: t.end_time,
//           duration: t.duration,
//           availableSeats: leftSeats.length,
//           seatsInfo: seatsInfo,
//           pickupPoint: pickupPointsArr[0],
//           dropPoint: dropPointsArr[0],
//           meals: t.meals || [],
//           isRecurring: t.is_recurring || false,
//           carInfo: {
//             id: t.Car?.id,
//             name: t.Car?.carName,
//             type: t.Car?.carType,
//             class: t.Car?.class,
//             totalSeats: t.Car?.totalSeats,
//             registrationNumber: t.Car?.registrationNumber,
//             carUniqueNumber: t.Car?.carUniqueNumber
//           },
//           minSeatPrice,
//           createdAt: t.created_at,
//           updatedAt: t.updated_at
//         });
//       }
  
//       // Sorting
//       if (sortBy === "priceLowHigh") filteredTrips.sort((a, b) => a.minSeatPrice - b.minSeatPrice);
//       else if (sortBy === "priceHighLow") filteredTrips.sort((a, b) => b.minSeatPrice - a.minSeatPrice);
//       else if (sortBy === "departureEarliest") filteredTrips.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
//       else if (sortBy === "departureLatest") filteredTrips.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  
//       return filteredTrips;
  
//     } catch (error) {
//       console.error("Error in searchTrips:", error);
//       throw new Error("Failed to search for trips. Please try again later.");
//     }
    
//     // Helper function
//     async function fetchPointNames(ids, Model) {
//       if (!Array.isArray(ids) || ids.length === 0) return [];
//       const items = await Model.findAll({ where: { id: ids } });
//       return items.map(p => ({ id: p.id, name: p.name }));
//     }
//   },
  
  
//   getSeatsForTrip: async (tripId, journeyDate = null) => {
//     // Get the trip with its seats
//     const trip = await Trip.findByPk(tripId, {
//       include: [
//         {
//           model: Seat,
//           as: 'seats',
//           attributes: ['id', 'seatNumber', 'price', 'isBooked', 'seatType'],
//           order: [['seatNumber', 'ASC']]
//         }
//       ]
//     });
    
//     if (!trip) {
//       throw new NotFound('Trip not found');
//     }

//     // If no journeyDate provided, return seats as is (for backward compatibility)
//     if (!journeyDate) {
//       return trip.seats || [];
//     }

//     // For non-recurring trips, only allow the original date
//     if (!trip.isRecurring) {
//       const tripDate = new Date(trip.startTime).toISOString().split('T')[0];
//       if (journeyDate !== tripDate) {
//         throw new Error('This is a one-time trip and is only available on ' + tripDate);
//       }
//     } else {
//       // For recurring trips, ensure the requested date is not before the trip's start date
//       const tripStartDate = new Date(trip.startTime).toISOString().split('T')[0];
//       if (journeyDate < tripStartDate) {
//         throw new Error('Journey date cannot be before the trip start date');
//       }
//     }

//     // Get all bookings for this trip on the specified date
//     const bookings = await Booking.findAll({
//       where: {
//         tripId,
//         journeyDate: new Date(journeyDate)
//       },
//       raw: true
//     });

//     // Extract all booked seat IDs
//     const bookedSeatIds = new Set();
//     bookings.forEach(booking => {
//       try {
//         const seats = JSON.parse(booking.seats);
//         seats.forEach(seat => bookedSeatIds.add(seat.seatId));
//       } catch (e) {
//         console.error('Error parsing seats for booking:', booking.id, e);
//       }
//     });

//     // Mark seats as booked if they're in the bookedSeatIds set
//     const seats = trip.seats.map(seat => ({
//       ...seat.get({ plain: true }),
//       isBooked: bookedSeatIds.has(seat.id) || seat.isBooked
//     }));

//     return seats;
//   },

//   deleteTrip: async (id) => {
//     const trip = await tripService.getTripById(id);
//     // Delete related records first to avoid foreign key constraints
//     await SeatPricing.destroy({ where: { tripId: id } });
//     await BookedSeat.destroy({ where: { tripId: id } });
//     await Booking.destroy({ where: { tripId: id } });
//     await Trip.destroy({ where: { id } });
//     return { message: 'Trip deleted successfully' };
//   },
// };

// module.exports = tripService;
