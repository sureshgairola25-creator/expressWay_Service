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

      const cabType = (car.cabType || '').toLowerCase().trim();
const bookingModeSnap = car.bookingMode || (
  cabType === 'personalize' ? 'personalized' : 'sharing_and_cabin'
);
const isPersonalized = cabType === 'personalize';  // ← use cabType directly, not bookingModeSnap

const tripToCreate = {
  startLocationId:      tripData.startLocationId,
  endLocationId:        tripData.endLocationId,
  pickupPoints:         tripData.pickupPoints,
  dropPoints:           tripData.dropPoints,
  carId:                tripData.carId,
  startTime:            startDt,
  endTime:              endDt,
  duration,
  status:               tripData.status ?? true,
  isRecurring:          tripData.isRecurring ?? true,
  repeatType:           tripData.repeatType  ?? 'daily',
  meals:                meals.length > 0 ? meals : null,
  tripGroupId,
  // ✅ FIX — explicit values, no undefined
  bookingModeSnapshot:  bookingModeSnap,
  totalSeatsSnapshot:   isPersonalized ? null : (car.totalSeats || 0),
  seatsPerCabinSnapshot: isPersonalized ? null : (car.cabinCapacity || null),
  availableSeats:       isPersonalized ? 1    : (car.totalSeats || 0),
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
  const { pickupPoint, dropPoint, date, page = 1, limit = 10, ...otherFilters } = query;
  const where = { ...otherFilters };

  const parsedPage  = parseInt(page,  10);
  const parsedLimit = parseInt(limit, 10);

  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    where.startTime = { [Op.between]: [startOfDay, endOfDay] };
  }

  // ── Fetch ALL matching trip IDs (no pagination yet) ──────────────────────
  // Pagination happens AFTER grouping, otherwise grouped trips get split
  const allIdRows = await Trip.findAll({
    where,
    attributes: ['id'],
    order: [['created_at', 'DESC']],
    raw: true,
  });

  const allTripIds = allIdRows.map(t => t.id);
  const total = allTripIds.length;

  if (total === 0) {
    return {
      data: [],
      pagination: { total: 0, page: parsedPage, limit: parsedLimit, totalPages: 0 },
    };
  }

  const trips = await Trip.findAll({
    where: { id: { [Op.in]: allTripIds } },
    include: [
      {
        model: Car,
        as: 'car',
        attributes: ['id','carName','carType','totalSeats',
          'registrationNumber','cabType',
          'pricePerSeat','pricePerCabin',
          'cabinCapacity','totalCabins','carUniqueNumber',
          'pricePerCar','imageUrl'],
        required: true,
      },
      {
        model: StartLocation,
        as: 'startLocation',
        attributes: ['id', 'name'],
        required: false
      },
      {
        model: EndLocation,
        as: 'endLocation',
        attributes: ['id', 'name'],
        required: false
      }
    ],
    attributes: ['id', 'pickupPoints', 'dropPoints','startLocationId',
      'endLocationId', 'startTime', 'endTime', 'duration', 'status','tripGroupId',
      'availableSeats', 'totalSeatsSnapshot', 'seatsPerCabinSnapshot', 'bookingModeSnapshot',
      'created_at', 'updated_at'],
    order: [['created_at', 'DESC']]
  });

  const allSeats = await Seat.findAll({
    where: { tripId: { [Op.in]: allTripIds } },
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

    // ── Fix: NULL-safe availableSeats ─────────────────────────────────────
    const availableSeats = trip.availableSeats != null
      ? trip.availableSeats
      : seats.filter(s => !s.isBooked).length;

    const seatsPerCabin = trip.seatsPerCabinSnapshot;
    const availableCabins = (trip.bookingModeSnapshot === 'sharing_and_cabin' && seatsPerCabin > 0)
      ? Math.floor(availableSeats / seatsPerCabin)
      : null;

    const canBookSeat  = availableSeats > 0;
    const canBookCabin = (
      trip.bookingModeSnapshot === 'sharing_and_cabin' &&
      seatsPerCabin > 0 &&
      availableSeats >= seatsPerCabin
    );

    const displayPrice = getDisplayPrice(trip.car);

    // ── Remove pickup/drop filter for admin getAllTrips ────────────────────
    // (admin needs to see ALL trips regardless of pickup/drop)

    return {
      id: trip.id,
      tripGroupId:     trip.tripGroupId || null,
      startLocation:   trip.startLocation  || null,
      endLocation:     trip.endLocation    || null,
      startLocationId: trip.startLocationId,
      endLocationId:   trip.endLocationId,
      pickupPoints: pickupPoints.map(p => ({
        id: p.id, name: p.name, type: 'pickup', startLocation: p.StartLocation
      })),
      dropPoints: dropPoints.map(d => ({
        id: d.id, name: d.name, type: 'drop', endLocation: d.EndLocation
      })),
      carInfo:              trip.car,
      startTime:            trip.startTime,
      endTime:              trip.endTime,
      duration:             trip.duration,
      status:               trip.status,
      availableSeats,
      availableCabins,
      canBookSeat,
      canBookCabin,
      bookingMode:          trip.bookingModeSnapshot,
      totalSeatsSnapshot:   trip.totalSeatsSnapshot,
      seatsPerCabinSnapshot: trip.seatsPerCabinSnapshot,
      bookingModeSnapshot:  trip.bookingModeSnapshot,
      seatsInfo:            seats,
      displayPrice,
      created_at:           trip.created_at,
      updated_at:           trip.updated_at
    };
  }));

  // ── No filtering — admin sees ALL trips ──────────────────────────────────
  const allProcessed = processedTrips.filter(Boolean);

  // ── Group by tripGroupId ──────────────────────────────────────────────────
  const groups   = {};
  const ungrouped = [];

  for (const trip of allProcessed) {
    if (trip.tripGroupId) {
      if (!groups[trip.tripGroupId]) {
        groups[trip.tripGroupId] = { ...trip, timings: [trip.startTime] };
      } else {
        groups[trip.tripGroupId].timings.push(trip.startTime);
        if (new Date(trip.startTime) < new Date(groups[trip.tripGroupId].startTime)) {
          groups[trip.tripGroupId].startTime = trip.startTime;
          groups[trip.tripGroupId].endTime   = trip.endTime;
        }
      }
    } else {
      ungrouped.push({ ...trip, timings: [trip.startTime] });
    }
  }

  const allGrouped = [...Object.values(groups), ...ungrouped]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // ── Paginate AFTER grouping ───────────────────────────────────────────────
  const groupedTotal = allGrouped.length;
  const offset       = (parsedPage - 1) * parsedLimit;
  const data         = allGrouped.slice(offset, offset + parsedLimit);

  return {
    data,
    pagination: {
      total:      groupedTotal,
      page:       parsedPage,
      limit:      parsedLimit,
      totalPages: Math.ceil(groupedTotal / parsedLimit),
    },
  };
},

  getTripById: async (id) => {
    const trip = await Trip.findByPk(id, {
      include: [
        {
          model: Car,
          as:"car",
          attributes: [
            'id', 'carName', 'carType', 'totalSeats', 'registrationNumber',
            'cabType', 'pricePerSeat', 'pricePerCabin', 'cabinCapacity',
            'totalCabins', 'pricePerCar', 'imageUrl'
          ]
        },
        {
    model: StartLocation,   // ← add karo
    as: 'startLocation',
    attributes: ['id', 'name'],
    required: false
  },
  {
    model: EndLocation,     // ← add karo
    as: 'endLocation',
    attributes: ['id', 'name'],
    required: false
  }
      ],
      attributes: ['id', 'pickupPoints', 'dropPoints', 'startLocationId', 'endLocationId',
  'startTime', 'endTime', 'duration', 'status', 'meals', 'is_fully_booked']
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
    const displayPrice = getDisplayPrice(trip.car);

    const result = {
      ...trip.get({ plain: true }),
       startLocation: trip.startLocation || null,   // ← add karo
  endLocation:   trip.endLocation   || null,   // ← add karo
  pickupPoints: pickupPoints.map(p => ({
    id: p.id, name: p.name, type: 'pickup', startLocation: p.StartLocation
  })),
  dropPoints: dropPoints.map(d => ({
    id: d.id, name: d.name, type: 'drop', endLocation: d.EndLocation
  })),
      carInfo: trip.car,
      availableSeats,
      displayPrice,
      seatsInfo: seats
    };

    if (result.car) delete result.car;

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
      if (data.carId && data.carId !== trip.carId) {
        const newCar = await Car.findByPk(data.carId, { transaction });
        if (newCar) {
          const isPersonalize = (newCar.cabType || '').toLowerCase() === 'personalize';
          await trip.update({
            bookingModeSnapshot: isPersonalize ? 'personalized' : 'sharing_and_cabin',
            totalSeatsSnapshot: isPersonalize ? null : (newCar.totalSeats || 0),
            seatsPerCabinSnapshot: isPersonalize ? null : (newCar.cabinCapacity || null),
            availableSeats: isPersonalize ? 1 : (newCar.totalSeats || 0),
          }, { transaction });
        }
      }


      await transaction.commit();
      return await tripService.getTripById(id);

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },



searchTrips: async (queryParams = {}) => {
  try {
    let {
      startLocation, endLocation, date, pickupPoint, dropPoint,
      minPrice, maxPrice, minSeats, timeRange, sortBy,
      departure_time, ride_type
    } = queryParams;

    // ── Safe sanitize — query params are strings but guard anyway ────────────
    const toStr = (v) => (v !== undefined && v !== null ? String(v).trim() : null);

    timeRange      = toStr(timeRange)      || null;
    sortBy         = toStr(sortBy)         || null;
    minPrice       = toStr(minPrice)       || null;
    maxPrice       = toStr(maxPrice)       || null;
    minSeats       = toStr(minSeats)       || null;
    departure_time = toStr(departure_time) || null;  // "06:00" or "06:00 AM"
    ride_type      = toStr(ride_type)      || null;  // "sharing" | "cabin"

    // Validate ride_type
    if (ride_type && !['sharing', 'cabin'].includes(ride_type)) {
      return { error: true, message: 'ride_type must be "sharing" or "cabin"' };
    }

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
    // where['$Car.cab_type$'] = { [Op.in]: ['sharing', 'cabin'] };

    // ── Fetch trips ──────────────────────────────────────────────────────────
    const trips = await Trip.findAll({
      where,
      include: [
        {
          model: Car,
                as: 'car',        // ← yeh add karo
          attributes: [
            'id', 'carName', 'carType', 'class', 'totalSeats',
            'carUniqueNumber', 'registrationNumber',
            'cabType', 'pricePerSeat', 'pricePerCabin',
            'cabinCapacity', 'totalCabins', 'pricePerCar', 'imageUrl',
            'availableModes', 'vehicleCategory'
          ],
          required: true,
          // Broad filter: always exclude personalize — ride_type refinement done in JS loop
          // where: { cabType: { [Op.in]: ['sharing', 'cabin'] } },
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

    // ── Correct base price per cabType or requested ride_type ───────────────
    // ride_type overrides cabType when a vehicle supports multiple modes
    function getBasePrice(car, requestedRideType = null) {
      if (!car) return 0;
      const effectiveType = requestedRideType || car.cabType;
      if (effectiveType === 'cabin')      return parseFloat(car.pricePerCabin || car.pricePerSeat || 0);
      if (effectiveType === 'personalize') return parseFloat(car.pricePerCar || 0);
      return parseFloat(car.pricePerSeat || 0); // sharing (default)
    }

    // ── Resolve effective modes for a car ────────────────────────────────────
    // availableModes takes priority over cabType for multi-mode vehicles
    function getCarModes(car) {
      if (!car) return [];
      if (Array.isArray(car.availableModes) && car.availableModes.length > 0) {
        return car.availableModes;
      }
      return car.cabType ? [car.cabType] : [];
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

      // ── ride_type / availableModes filter ─────────────────────────────────
      // Vehicles with availableModes=["sharing","cabin"] can appear in either tab.
      // Vehicles without availableModes fall back to cabType.
      if (ride_type) {
        const carModes = getCarModes(t.car);
        if (!carModes.includes(ride_type)) continue;
      }

      // ── departure_time filter (HH:MM in IST) ─────────────────────────────
      if (departure_time) {
        const dt = new Date(t.startTime);
        const istTotalMin = (dt.getUTCHours() * 60 + dt.getUTCMinutes() + 330) % 1440;
        const istHH = Math.floor(istTotalMin / 60).toString().padStart(2, '0');
        const istMM = (istTotalMin % 60).toString().padStart(2, '0');
        const tripTimeHHMM = `${istHH}:${istMM}`;
        // Accept "06:00" or "06:00 AM" / "6:00 AM" formats
        const cleanDep = departure_time.replace(/\s*(AM|PM)$/i, '').trim().padStart(5, '0');
        if (tripTimeHHMM !== cleanDep) continue;
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

      // ── Price priority: seat_price OR cheaper pickup_price ───────────────
      // Rule: use pickup_price only if it exists AND is less than base_price
      const startId = t.startLocationId || t.dataValues?.startLocationId;
      const basePrice = getBasePrice(t.car, ride_type);
      let pickupOverridePrice = null;  // cheapest applicable pickup price

      if (startId) {
        const cheapestPickup = await PickupPoint.findOne({
          where: {
            startLocationId: startId,
            isCityDefault:   true,
            status:          1,
            price:           { [Op.not]: null },
            endLocationId:   t.endLocationId,
          },
          order: [['price', 'ASC']],
          raw: true,
        });
        if (cheapestPickup?.price) {
          const pp = parseFloat(cheapestPickup.price);
          // Only use pickup price if it is strictly cheaper than base price
          if (pp < basePrice) pickupOverridePrice = pp;
        }
      }

      const displayPrice = pickupOverridePrice !== null ? pickupOverridePrice : basePrice;

      // ── Price filter ──────────────────────────────────────────────────────
      if (minPrice && displayPrice < parseFloat(minPrice)) continue;
      if (maxPrice && displayPrice > parseFloat(maxPrice)) continue;

      // ── minSeats filter ───────────────────────────────────────────────────
      // Sharing: count available seats; Cabin: count available cabin units
      // Use effective cabType based on ride_type (for multi-mode vehicles)
      const cabType = ride_type || t.car?.cabType;
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
          const availableCabins = (t.car?.totalCabins || 0) - bookedCabins;
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
// const tripCabType  = t.car?.cabType || 'sharing';
const effectiveRideType = ride_type || t.car?.cabType || 'sharing';

const idsToFetch   = pickupIdInt ? [pickupIdInt] : pickupIds;

// 1. Trip-specific pickup points (assigned to this trip)
const specificPickups = idsToFetch.length > 0
  ? await PickupPoint.findAll({
      where: {
        id:           idsToFetch,
        isCityDefault: false,
        status:        1,
        [Op.or]: [
          { cabType: effectiveRideType },  // ← tripCabType → effectiveRideType
          { cabType: 'all' }
        ],
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
   [Op.or]: [
      { cabType: effectiveRideType },  // ← tripCabType → effectiveRideType
      { cabType: 'all' }
    ],
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
    // price:         p.price != null ? parseFloat(p.price) : getDisplayPrice(t.car),
    price: p.price != null
      ? parseFloat(p.price)
      : effectiveRideType === 'cabin'
        ? parseFloat(t.car?.pricePerCabin || 0)
        : parseFloat(t.car?.pricePerSeat || 0),
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

      // (debug logs removed)

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

      const totalCabins     = t.car?.totalCabins || 0;
      const availableCabins = cabType === 'cabin'
        ? totalCabins - new Set(bookedCabinNumbers).size
        : null;

      filteredTrips.push({
        trip_id:        t.id,
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
          id:                 t.car?.id,
          name:               t.car?.carName,
          type:               t.car?.carType,
          class:              t.car?.class,
          totalSeats:         t.car?.totalSeats,
          registrationNumber: t.car?.registrationNumber,
          carUniqueNumber:    t.car?.carUniqueNumber,
          cabType:            t.car?.cabType,
          availableModes:     getCarModes(t.car),
          vehicleCategory:    t.car?.vehicleCategory || null,
          pricePerSeat:       t.car?.pricePerSeat  != null ? parseFloat(t.car.pricePerSeat)  : null,
          pricePerCabin:      t.car?.pricePerCabin != null ? parseFloat(t.car.pricePerCabin) : null,
          cabinCapacity:      t.car?.cabinCapacity,
          totalCabins:        t.car?.totalCabins,
          pricePerCar:        t.car?.pricePerCar   != null ? parseFloat(t.car.pricePerCar)   : null,
          imageUrl:           t.car?.imageUrl,
        },
        // ── Pricing fields (consistent across listing, vehicle selection, summary) ──
        seatsPerCabinSnapshot: t.seatsPerCabinSnapshot || null,
        seat_price:         t.car?.pricePerSeat  != null ? parseFloat(t.car.pricePerSeat)  : null,
        cabin_price:        t.car?.pricePerCabin != null ? parseFloat(t.car.pricePerCabin) : null,
        pickup_price:       pickupOverridePrice,   // null if no cheaper pickup exists
        // final_display_price: pickup_price if cheaper, else seat/cabin price
        final_display_price: displayPrice,
        displayPrice,
        available_modes:    getCarModes(t.car),
        requested_ride_type: ride_type || null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      });
    }

    // Sort by IST time-of-day (not full UTC timestamp).
    // Recurring trips retain their original creation date in startTime, so comparing
    // full datetimes would order them by creation date rather than departure time.
    // Using minutes-within-IST-day gives correct chronological order for all trips.
    const istMinutesOfDay = (isoString) => {
      const d = new Date(isoString);
      return (d.getUTCHours() * 60 + d.getUTCMinutes() + 330) % 1440;
    };

    filteredTrips.sort((a, b) => istMinutesOfDay(a.startTime) - istMinutesOfDay(b.startTime));

    // Then user-specified sort overrides (only if explicitly requested)
    if (sortBy === 'priceLowHigh') {
      filteredTrips.sort((a, b) => a.displayPrice - b.displayPrice);
    } else if (sortBy === 'priceHighLow') {
      filteredTrips.sort((a, b) => b.displayPrice - a.displayPrice);
    } else if (sortBy === 'departureEarliest') {
      filteredTrips.sort((a, b) => istMinutesOfDay(a.startTime) - istMinutesOfDay(b.startTime));
    } else if (sortBy === 'departureLatest') {
      filteredTrips.sort((a, b) => istMinutesOfDay(b.startTime) - istMinutesOfDay(a.startTime));
    }

    return filteredTrips;

  } catch (error) {
    console.error('[searchTrips] Unexpected error:', error);
    throw new Error('Failed to search for trips. Please try again later.');
  }
},
 searchPersonalizeTrips : async (queryParams = {}) => {
  try {
    // Params: startLocation, endLocation, date (required)
    // vehicleCategory: "Compact" | "Executive" | "Family" | "Grand" (optional)
    // carType: legacy filter kept for backward-compat (e.g. "Sedan")
    let { startLocation, endLocation, date, carType, vehicleCategory } = queryParams;

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

    // ── 2. Build Car WHERE clause ─────────────────────────────────────────────
    const carWhere = { cabType: 'personalize' };

    // vehicleCategory filter (Compact / Executive / Family / Grand)
    // Maps to the DB vehicleCategory column if set, otherwise falls back to carType
    const categoryToCarTypes = {
      'compact':   ['compact'],
      'executive': ['executive'],
      'family':    ['family'],
      'grand':     ['grand'],
    };

    if (vehicleCategory && vehicleCategory.trim() !== '') {
      const cat = vehicleCategory.trim();
      const mappedTypes = categoryToCarTypes[cat];
      if (mappedTypes) {
        // Prefer vehicleCategory DB column; fall back to carType mapping
        carWhere[Op.or] = [
          { vehicleCategory: cat },
          { carType: { [Op.in]: mappedTypes } },
        ];
      }
    } else if (carType && carType.trim() !== '') {
      // Legacy carType filter (kept for backward-compat)
      // carWhere.carType = carType.trim().replace(/^\w/, c => c.toUpperCase());
      // carWhere.carType = carType.trim().toLowerCase();
      if (carType.includes(",")) {
  carWhere.carType = {
    [Op.in]: carType.split(",")
  };
}
    }

    // ── 3. Fetch trips ────────────────────────────────────────────────────────
    const trips = await Trip.findAll({
      where: {
        status:            true,
        start_location_id: parseInt(startLocation),
        end_location_id:   parseInt(endLocation),
      },
      include: [
        {
          model: Car,
          as :"car",
          where: carWhere,
          attributes: [
            'id', 'carName', 'carType', 'class', 'totalSeats',
            'carUniqueNumber', 'registrationNumber',
            'pricePerCar', 'imageUrl', 'vehicleCategory', 'availableModes'
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
 
 
    // ── 3. Filter loop — UNCHANGED from your original ─────────────────────────
    const availableTrips = [];
 
    for (const t of trips) {
 
      if (!t?.dataValues?.start_time || isNaN(new Date(t?.dataValues?.start_time).getTime())) {
        continue;
      }
 
      const tripDateStr = new Date(t?.dataValues?.start_time).toISOString().split('T')[0];
 
      if (t.dataValues.is_recurring) {
        if (searchDate < tripDateStr) continue;
      } else {
        if (tripDateStr !== searchDate) continue;
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
 
      if (existingBooking) continue;
 
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
 
      const carPrice = parseFloat(t.dataValues.car?.pricePerCar || 0);
      availableTrips.push({
        trip_id:       t.id,
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
          id:                 t.dataValues.car?.id,
          name:               t.dataValues.car?.carName,
          type:               t.dataValues.car?.carType,
          class:              t.dataValues.car?.class,
          totalSeats:         t.dataValues.car?.totalSeats,
          registrationNumber: t.dataValues.car?.registrationNumber,
          carUniqueNumber:    t.dataValues.car?.carUniqueNumber,
          cabType:            'personalize',
          vehicleCategory:    t.dataValues.car?.vehicleCategory || null,
          availableModes:     ['personalize'],
          pricePerCar:        carPrice,
          imageUrl:           t.dataValues.car?.imageUrl,
        },
        price:               carPrice,
        seat_price:          null,
        cabin_price:         null,
        final_display_price: carPrice,
        pickup_price:        null,
        createdAt: t.dataValues.created_at,
      });
    }
 
 
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
// Helper: derive seat price from car based on cab type or requested ride_type
// rideType overrides cabType for multi-mode vehicles (availableModes)
// ─────────────────────────────────────────────────────────────────────────────
function getSeatPriceFromCar(car, rideType = null) {
  if (!car) return 0;
  const effectiveType = rideType || car.cabType;
  if (effectiveType === 'sharing')     return parseFloat(car.pricePerSeat)  || 0;
  if (effectiveType === 'cabin')       return parseFloat(car.pricePerCabin) || 0;
  if (effectiveType === 'personalize') return parseFloat(car.pricePerCar)   || 0;
  return parseFloat(car.pricePerSeat) || 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: get the display price for a car (what to show user / use for sorting)
// ─────────────────────────────────────────────────────────────────────────────
function getDisplayPrice(car, rideType = null) {
  if (!car) return 0;
  const effectiveType = rideType || car.cabType;
  if (effectiveType === 'sharing')     return parseFloat(car.pricePerSeat)  || 0;
  if (effectiveType === 'cabin')       return parseFloat(car.pricePerCabin) || 0;
  if (effectiveType === 'personalize') return parseFloat(car.pricePerCar)   || 0;
  return parseFloat(car.pricePerSeat) || 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// getDepartureTimes
// Returns available departure times for a route + ride_type combination.
// Frontend clock-selector uses this to populate selectable time slots.
//
// GET /api/trips/departure-times
//   ?startLocation=1&endLocation=2&ride_type=sharing&date=2026-04-03
//
// Returns: [{ value: "06:00", display: "06:00 AM" }, ...]
// ─────────────────────────────────────────────────────────────────────────────
tripService.getDepartureTimes = async (queryParams = {}) => {
  try {
    let { startLocation, endLocation, ride_type, date } = queryParams;

    if (!startLocation || !endLocation) {
      return { error: true, message: 'startLocation and endLocation are required' };
    }

    const searchDate = (date && /^\d{4}-\d{2}-\d{2}$/.test(String(date).trim()))
      ? String(date).trim()
      : new Date().toISOString().split('T')[0];

    // DB-level broad filter; JS-level refines by availableModes
    const carWhere = {};
    if (ride_type === 'personalize') {
      carWhere.cabType = 'personalize';
    } else {
      // sharing, cabin, or unspecified → exclude personalize
      carWhere.cabType = { [Op.ne]: 'personalize' };
    }

    const trips = await Trip.findAll({
      where: {
        status:          true,
        startLocationId: parseInt(startLocation),
        endLocationId:   parseInt(endLocation),
      },
      include: [{
        model: Car,
        where: carWhere,
        attributes: ['id', 'cabType', 'availableModes'],
        required: true,
      }],
      attributes: ['id', 'startTime', 'isRecurring'],
      order: [['startTime', 'ASC']],
    });

    const seenTimes = new Set();
    const result = [];

    for (const t of trips) {
      if (!t.startTime || isNaN(new Date(t.startTime).getTime())) continue;

      const tripDateStr = new Date(t.startTime).toISOString().split('T')[0];

      // Date filter (recurring vs one-time)
      if (t.isRecurring) {
        if (searchDate < tripDateStr) continue;
      } else {
        if (tripDateStr !== searchDate) continue;
      }

      // ride_type filter via availableModes (or fallback to cabType)
      if (ride_type) {
        const modes = (Array.isArray(t.Car?.availableModes) && t.Car.availableModes.length > 0)
          ? t.Car.availableModes
          : [t.Car?.cabType];
        if (!modes.includes(ride_type)) continue;
      }

      // Convert startTime to IST HH:MM
      const dt = new Date(t.startTime);
      const istTotalMin = (dt.getUTCHours() * 60 + dt.getUTCMinutes() + 330) % 1440;
      const istH = Math.floor(istTotalMin / 60);
      const istM = istTotalMin % 60;
      const hh   = istH.toString().padStart(2, '0');
      const mm   = istM.toString().padStart(2, '0');
      const value = `${hh}:${mm}`;  // e.g. "06:00"

      if (seenTimes.has(value)) continue;
      seenTimes.add(value);

      const period  = istH >= 12 ? 'PM' : 'AM';
      const h12     = istH % 12 || 12;
      const display = `${h12.toString().padStart(2, '0')}:${mm} ${period}`; // "06:00 AM"

      result.push({ value, display });
    }

    return result;

  } catch (err) {
    console.error('[getDepartureTimes] Error:', err);
    throw new Error('Failed to fetch departure times');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// calculatePrice
// Returns the correct price for a trip based on bookingMode and seatCount.
// bookingMode = 'seat'  → price = seatPrice × seatCount
// bookingMode = 'cabin' → price = seatPrice × seatsPerCabinSnapshot
// ─────────────────────────────────────────────────────────────────────────────
tripService.calculatePrice = async ({ tripId, bookingMode, seatCount }) => {
  const trip = await Trip.findByPk(tripId, {
    include: [{
      model: Car,
      as: 'car',
      attributes: ['pricePerSeat', 'pricePerCabin', 'cabinCapacity'],
    }],
  });

  if (!trip) throw new Error('Trip not found');

  const car = trip.car;
  const seatPrice = parseFloat(car?.pricePerSeat) || 0;
  const seatsPerCabin = trip.seatsPerCabinSnapshot || car?.cabinCapacity || 1;

  let price;
  if (bookingMode === 'cabin') {
    price = seatPrice * seatsPerCabin;
  } else {
    price = seatPrice * (parseInt(seatCount) || 1);
  }

  return {
    price,
    seatPrice,
    seatsPerCabinSnapshot: seatsPerCabin,
    bookingMode,
    seatCount: parseInt(seatCount) || 1,
  };
};

module.exports = tripService;