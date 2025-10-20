const { Trip, Car, Seat, StartLocation, EndLocation, SeatPricing, PickupPoint, DropPoint, BookedSeat, Booking } = require('../db/models');
const { Op, Sequelize } = require('sequelize');
const { NotFound } = require('http-errors');

const tripService = {
  createTrip: async (data) => {
    return Trip.create(data);
  },

  getAllTrips: async () => {
    const trips = await Trip.findAll({
      include: [
        {
          model: Car,
          attributes: ['carName', 'carType', 'totalSeats', 'registrationNumber'],
          required: true,
        },
        {
          model: StartLocation,
          as: 'startLocation',
          attributes: ['id', 'name'],
        },
        {
          model: EndLocation,
          as: 'endLocation',
          attributes: ['id', 'name'],
        },
        {
          model: PickupPoint,
          as: 'pickupPoint',
          attributes: ['id', 'name'],
        },
        {
          model: DropPoint,
          as: 'dropPoint',
          attributes: ['id', 'name'],
        },
        {
          model: SeatPricing,
          attributes: ['seatNumber', 'seatType', 'price', 'isBooked'],
          required: false,
        },
      ],
      attributes: ['id', 'startTime', 'endTime', 'duration', 'status'],
    });
  
    // 🧠 Process and return structured data
    return trips.map(trip => {
      const seatPrices = trip.SeatPricings?.map(s => s.price) || [];
      const minSeatPrice = seatPrices.length ? Math.min(...seatPrices) : 0;
  
      const availableSeats = trip.SeatPricings?.filter(s => !s.isBooked).length || 0;
      const bookedSeats = trip.SeatPricings?.filter(s => s.isBooked).length || 0;
  
      return {
        id: trip.id,
        startLocation: trip.startLocation?.name || 'N/A',
        pickupPoint: trip.pickupPoint?.name || 'N/A',
        endLocation: trip.endLocation?.name || 'N/A',
        dropPoint: trip.dropPoint?.name || 'N/A',
        carInfo: trip.Car,
        startTime: trip.startTime,
        endTime: trip.endTime,
        duration: trip.duration,
        status: trip.status,
        availableSeats,
        bookedSeats,
        minSeatPrice,
        seatsInfo: trip.SeatPricings || [],
      };
    });
  },
  

  getTripById: async (id) => {
    const trip = await Trip.findByPk(id);
    if (!trip) {
      throw new NotFound('Trip not found');
    }
    return trip;
  },

  updateTrip: async (id, data) => {
    const trip = await tripService.getTripById(id);
    return trip.update(data);
  },

  deleteTrip: async (id) => {
    const trip = await tripService.getTripById(id);
    // Delete related records first to avoid foreign key constraints
    await SeatPricing.destroy({ where: { tripId: id } });
    await BookedSeat.destroy({ where: { tripId: id } });
    await Booking.destroy({ where: { tripId: id } });
    await trip.destroy();
    return { message: 'Trip deleted successfully' };
  },

  searchTrips: async (queryParams) => {
    const { 
      startLocation, 
      endLocation, 
      date, 
      carType, 
      minPrice, 
      maxPrice, 
      minSeats, 
      timeRange, 
      duration, 
      sortBy 
    } = queryParams;
  
    const where = {};
  
    // 🌍 Location Filters
    if (startLocation) {
      where.startLocationId = parseInt(startLocation);
    }
    if (endLocation) {
      where.endLocationId = parseInt(endLocation);
    }
  
    // 📅 Date Filter
    if (date) {
      const searchDate = new Date(date);
      const startOfDay = new Date(searchDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(searchDate.setHours(23, 59, 59, 999));
      where.startTime = { [Op.between]: [startOfDay, endOfDay] };
    }
  
    // 🚗 Car Include (Filter on carType if given)
    const includeCar = {
      model: Car,
      attributes: ['carName', 'carType', 'totalSeats', 'registrationNumber'],
      required: true,
    };
  
    if (carType) {
      includeCar.where = { carType };
    }
  
    // 💺 Seat Info Include
    const includeSeatPricing = {
      model: SeatPricing,
      attributes: ['seatNumber', 'seatType', 'price', 'isBooked'],
      required: false,
    };
  
    // 🚌 Fetch Trips
    const trips = await Trip.findAll({
      where,
      include: [
        includeCar,
        { model: StartLocation, as: 'startLocation', attributes: ['id', 'name'] },
        { model: EndLocation, as: 'endLocation', attributes: ['id', 'name'] },
        { model: PickupPoint, as: 'pickupPoint', attributes: ['id', 'name'] },
        { model: DropPoint, as: 'dropPoint', attributes: ['id', 'name'] },
        includeSeatPricing,
      ],
      attributes: ['id', 'startTime', 'endTime', 'duration', 'status'],
    });
  
    // 🔍 Filter & Process Trips
    let filteredTrips = trips.map(trip => {
      const seatPrices = trip.SeatPricings?.map(s => s.price) || [];
      const minSeatPrice = seatPrices.length ? Math.min(...seatPrices) : 0;
      const availableSeats = trip.SeatPricings?.filter(s => !s.isBooked).length || 0;
  
      return {
        id: trip.id,
        startLocation: trip.startLocation?.name || 'N/A',
        pickupPoint: trip.pickupPoint?.name || 'N/A',
        endLocation: trip.endLocation?.name || 'N/A',
        dropPoint: trip.dropPoint?.name || 'N/A',
        carInfo: trip.Car,
        startTime: trip.startTime,
        endTime: trip.endTime,
        duration: trip.duration,
        status: trip.status,
        availableSeats,
        minSeatPrice,
        seatsInfo: trip.SeatPricings || [],
      };
    });
  
    // 💰 Apply Price & Seat Filters (JS Side)
    filteredTrips = filteredTrips.filter(trip => {
      if (minPrice && trip.minSeatPrice < minPrice) return false;
      if (maxPrice && trip.minSeatPrice > maxPrice) return false;
      if (minSeats && trip.availableSeats < minSeats) return false;
      
      // ⏰ Time Range Filter
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
  
    // 🔄 Sorting (JS-Level)
    if (sortBy === 'priceLowHigh') {
      filteredTrips.sort((a, b) => a.minSeatPrice - b.minSeatPrice);
    } else if (sortBy === 'priceHighLow') {
      filteredTrips.sort((a, b) => b.minSeatPrice - a.minSeatPrice);
    } else if (sortBy === 'departureEarliest') {
      filteredTrips.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    } else if (sortBy === 'departureLatest') {
      filteredTrips.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    }
  
    return filteredTrips;
  },
  

  getSeatsForTrip: async (tripId) => {
    const trip = await Trip.findByPk(tripId);
    if (!trip) {
      throw new NotFound('Trip not found');
    }

    const seats = await SeatPricing.findAll({
      where: { tripId },
      attributes: ['seatNumber', 'seatType', 'price', 'isBooked'],
      order: [['seatNumber', 'ASC']], // Order by seat number
    });

    return seats;
  },
};

module.exports = tripService;
