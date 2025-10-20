const { sequelize, StartLocation, EndLocation, Route, Car, Trip, SeatPricing, Seat, PickupPoint, DropPoint } = require('./src/db/models');

async function seedDatabase() {
  try {
    console.log('🚀 Starting database seeding...');

    // Sync database to ensure tables match models (recreates tables if needed)
    await sequelize.sync({ force: true });
    console.log('✅ Database synced successfully');

    // Step 1: Disable foreign key checks for safe truncation
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');

    // Step 1b: Delete existing data in correct order (reverse dependency order)
    console.log('🗑️ Deleting existing data...');
    // await SeatPricing.destroy({ where: {} });
    await Trip.destroy({ where: {} });
    await Car.destroy({ where: {} });
    // await Route.destroy({ where: {} });
    await EndLocation.destroy({ where: {} });
    await StartLocation.destroy({ where: {} });

    // Also delete from Seat table if it exists
    if (Seat) {
      await Seat.destroy({ where: {} });
    }

    // Step 1c: Re-enable foreign key checks
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('✅ Old data cleared successfully');

    // Step 2: Insert new test data
    console.log('📝 Inserting new test data...');

    // Create start locations
    const startLocations = await StartLocation.bulkCreate([
      { name: 'New Delhi', status: true },
      { name: 'Gurgaon', status: true },
      { name: 'Noida', status: true },
    ]);

    // Create pickup points
    const pickupPoints = await PickupPoint.bulkCreate([
      { name: 'Botanical Garden', startLocationId: startLocations[0].id, status: true },
      { name: 'Sector 62', startLocationId: startLocations[0].id, status: true },
      { name: 'Akshardham', startLocationId: startLocations[0].id, status: true },
      { name: 'Cyber City', startLocationId: startLocations[1].id, status: true },
      { name: 'Golf Course Road', startLocationId: startLocations[1].id, status: true },
      { name: 'Sector 18', startLocationId: startLocations[2].id, status: true },
    ]);

    // Create end locations
    const endLocations = await EndLocation.bulkCreate([
      { name: 'Rishikesh', startLocationId: startLocations[0].id, status: true },
      { name: 'Dehradun', startLocationId: startLocations[0].id, status: true },
      { name: 'Haridwar', startLocationId: startLocations[1].id, status: true },
      { name: 'Mussoorie', startLocationId: startLocations[1].id, status: true },
    ]);

    // Create drop points
    const dropPoints = await DropPoint.bulkCreate([
      { name: 'Har Ki Pauri', endLocationId: endLocations[0].id, status: true },
      { name: 'Jawalapur', endLocationId: endLocations[0].id, status: true },
      { name: 'Bahadarabad', endLocationId: endLocations[0].id, status: true },
      { name: 'Raiwala', endLocationId: endLocations[1].id, status: true },
      { name: 'Nepali Farm', endLocationId: endLocations[1].id, status: true },
      { name: 'Haridwar Junction', endLocationId: endLocations[2].id, status: true },
      { name: 'Roorkee', endLocationId: endLocations[2].id, status: true },
      { name: 'Mall Road', endLocationId: endLocations[3].id, status: true },
      { name: 'Kempty Falls', endLocationId: endLocations[3].id, status: true },
    ]);

    console.log('✅ Locations created');

    // Create cars
    const cars = await Car.bulkCreate([
      {
        carName: 'Innova Crysta',
        carType: 'SUV',
        totalSeats: 7,
        registrationNumber: 'DL01CA1234',
      },
      {
        carName: 'Swift Dzire',
        carType: 'Sedan',
        totalSeats: 5,
        registrationNumber: 'DL01CA5678',
      },
      {
        carName: 'Honda City',
        carType: 'Sedan',
        totalSeats: 5,
        registrationNumber: 'DL01CA9012',
      },
      {
        carName: 'Toyota Fortuner',
        carType: 'SUV',
        totalSeats: 7,
        registrationNumber: 'DL01CA3456',
      },
      {
        carName: 'Maruti Alto',
        carType: 'Hatchback',
        totalSeats: 4,
        registrationNumber: 'DL01CA7890',
      },
      {
        carName: 'Hyundai Creta',
        carType: 'SUV',
        totalSeats: 5,
        registrationNumber: 'DL01CA2345',
      },
    ]);

    console.log('✅ Cars created');

    // Create trips
    const trips = await Trip.bulkCreate([
      {
        startLocationId: startLocations[0].id, // New Delhi
        endLocationId: endLocations[0].id,    // Rishikesh
        pickupPointId: pickupPoints[0].id,    // Botanical Garden
        dropPointId: dropPoints[0].id,        // Har Ki Pauri
        carId: cars[0].id,                    // Innova Crysta
        startTime: new Date('2025-10-19T09:00:00Z'),
        endTime: new Date('2025-10-21T15:00:00Z'),
        duration: '6 hours',
        status: true,
      },
      {
        startLocationId: startLocations[0].id, // New Delhi
        endLocationId: endLocations[1].id,    // Dehradun
        pickupPointId: pickupPoints[1].id,    // Sector 62
        dropPointId: dropPoints[5].id,        // Nepali Farm
        carId: cars[2].id,                    // Honda City
        startTime: new Date('2025-10-20T06:00:00Z'),
        endTime: new Date('2025-10-20T12:00:00Z'),
        duration: '6 hours',
        status: true,
      },
      {
        startLocationId: startLocations[1].id, // Gurgaon
        endLocationId: endLocations[2].id,    // Haridwar
        pickupPointId: pickupPoints[4].id,    // Golf Course Road
        dropPointId: dropPoints[6].id,        // Haridwar Junction
        carId: cars[3].id,                    // Toyota Fortuner
        startTime: new Date('2025-10-21T14:00:00Z'),
        endTime: new Date('2025-10-21T20:00:00Z'),
        duration: '6 hours',
        status: true,
      },
      {
        startLocationId: startLocations[2].id, // Noida
        endLocationId: endLocations[3].id,    // Mussoorie
        pickupPointId: pickupPoints[5].id,    // Sector 18
        dropPointId: dropPoints[8].id,        // Kempty Falls
        carId: cars[4].id,                    // Maruti Alto
        startTime: new Date('2025-10-20T07:00:00Z'),
        endTime: new Date('2025-10-20T11:00:00Z'),
        duration: '4 hours',
        status: true,
      },
      {
        startLocationId: startLocations[0].id, // New Delhi
        endLocationId: endLocations[2].id,    // Haridwar
        pickupPointId: pickupPoints[2].id,    // Akshardham
        dropPointId: dropPoints[7].id,        // Roorkee
        carId: cars[5].id,                    // Hyundai Creta
        startTime: new Date('2025-10-21T10:00:00Z'),
        endTime: new Date('2025-10-21T16:00:00Z'),
        duration: '6 hours',
        status: true,
      },
      {
        startLocationId: startLocations[1].id, // Gurgaon
        endLocationId: endLocations[0].id,    // Rishikesh
        pickupPointId: pickupPoints[3].id,    // Cyber City
        dropPointId: dropPoints[1].id,        // Jawalapur
        carId: cars[0].id,                    // Innova Crysta
        startTime: new Date('2025-10-20T05:00:00Z'),
        endTime: new Date('2025-10-20T11:00:00Z'),
        duration: '6 hours',
        status: true,
      },
      {
        startLocationId: startLocations[2].id, // Noida
        endLocationId: endLocations[1].id,    // Dehradun
        pickupPointId: pickupPoints[5].id,    // Sector 18
        dropPointId: dropPoints[5].id,        // Nepali Farm
        carId: cars[1].id,                    // Swift Dzire
        startTime: new Date('2025-10-21T08:00:00Z'),
        endTime: new Date('2025-10-21T14:00:00Z'),
        duration: '6 hours',
        status: true,
      },
      {
        startLocationId: startLocations[0].id, // New Delhi
        endLocationId: endLocations[3].id,    // Mussoorie
        pickupPointId: pickupPoints[0].id,    // Botanical Garden
        dropPointId: dropPoints[8].id,        // Mall Road
        carId: cars[2].id,                    // Honda City
        startTime: new Date('2025-10-20T12:00:00Z'),
        endTime: new Date('2025-10-20T18:00:00Z'),
        duration: '6 hours',
        status: true,
      },
      {
        startLocationId: startLocations[1].id, // Gurgaon
        endLocationId: endLocations[2].id,    // Haridwar
        pickupPointId: pickupPoints[4].id,    // Golf Course Road
        dropPointId: dropPoints[6].id,        // Haridwar Junction
        carId: cars[3].id,                    // Toyota Fortuner
        startTime: new Date('2025-10-21T16:00:00Z'),
        endTime: new Date('2025-10-21T22:00:00Z'),
        duration: '6 hours',
        status: true,
      },
      {
        startLocationId: startLocations[2].id, // Noida
        endLocationId: endLocations[0].id,    // Rishikesh
        pickupPointId: pickupPoints[5].id,    // Sector 18
        dropPointId: dropPoints[0].id,        // Har Ki Pauri
        carId: cars[4].id,                    // Maruti Alto
        startTime: new Date('2025-10-20T09:00:00Z'),
        endTime: new Date('2025-10-20T13:00:00Z'),
        duration: '4 hours',
        status: true,
      },
      {
        startLocationId: startLocations[0].id, // New Delhi
        endLocationId: endLocations[1].id,    // Dehradun
        pickupPointId: pickupPoints[1].id,    // Sector 62
        dropPointId: dropPoints[4].id,        // Raiwala
        carId: cars[5].id,                    // Hyundai Creta
        startTime: new Date('2025-10-21T11:00:00Z'),
        endTime: new Date('2025-10-21T17:00:00Z'),
        duration: '6 hours',
        status: true,
      },
      {
        startLocationId: startLocations[1].id, // Gurgaon
        endLocationId: endLocations[3].id,    // Mussoorie
        pickupPointId: pickupPoints[3].id,    // Cyber City
        dropPointId: dropPoints[8].id,        // Kempty Falls
        carId: cars[0].id,                    // Innova Crysta
        startTime: new Date('2025-10-20T13:00:00Z'),
        endTime: new Date('2025-10-20T19:00:00Z'),
        duration: '6 hours',
        status: true,
      },
      {
        startLocationId: startLocations[2].id, // Noida
        endLocationId: endLocations[2].id,    // Haridwar
        pickupPointId: pickupPoints[5].id,    // Sector 18
        dropPointId: dropPoints[7].id,        // Roorkee
        carId: cars[1].id,                    // Swift Dzire
        startTime: new Date('2025-10-21T07:00:00Z'),
        endTime: new Date('2025-10-21T13:00:00Z'),
        duration: '6 hours',
        status: true,
      },
      {
        startLocationId: startLocations[0].id, // New Delhi
        endLocationId: endLocations[0].id,    // Rishikesh
        pickupPointId: pickupPoints[2].id,    // Akshardham
        dropPointId: dropPoints[1].id,        // Jawalapur
        carId: cars[2].id,                    // Honda City
        startTime: new Date('2025-10-20T15:00:00Z'),
        endTime: new Date('2025-10-20T21:00:00Z'),
        duration: '6 hours',
        status: true,
      },
      {
        startLocationId: startLocations[1].id, // Gurgaon
        endLocationId: endLocations[1].id,    // Dehradun
        pickupPointId: pickupPoints[4].id,    // Golf Course Road
        dropPointId: dropPoints[5].id,        // Nepali Farm
        carId: cars[3].id,                    // Toyota Fortuner
        startTime: new Date('2025-10-21T06:00:00Z'),
        endTime: new Date('2025-10-21T12:00:00Z'),
        duration: '6 hours',
        status: true,
      },
      {
        startLocationId: startLocations[2].id, // Noida
        endLocationId: endLocations[3].id,    // Mussoorie
        pickupPointId: pickupPoints[5].id,    // Sector 18
        dropPointId: dropPoints[8].id,        // Mall Road
        carId: cars[4].id,                    // Maruti Alto
        startTime: new Date('2025-10-20T10:00:00Z'),
        endTime: new Date('2025-10-20T14:00:00Z'),
        duration: '4 hours',
        status: true,
      },
      {
        startLocationId: startLocations[0].id, // New Delhi
        endLocationId: endLocations[2].id,    // Haridwar
        pickupPointId: pickupPoints[0].id,    // Botanical Garden
        dropPointId: dropPoints[6].id,        // Haridwar Junction
        carId: cars[5].id,                    // Hyundai Creta
        startTime: new Date('2025-10-21T12:00:00Z'),
        endTime: new Date('2025-10-21T18:00:00Z'),
        duration: '6 hours',
        status: true,
      },
      {
        startLocationId: startLocations[1].id, // Gurgaon
        endLocationId: endLocations[0].id,    // Rishikesh
        pickupPointId: pickupPoints[3].id,    // Cyber City
        dropPointId: dropPoints[0].id,        // Har Ki Pauri
        carId: cars[0].id,                    // Innova Crysta
        startTime: new Date('2025-10-20T14:00:00Z'),
        endTime: new Date('2025-10-20T20:00:00Z'),
        duration: '6 hours',
        status: true,
      },
      {
        startLocationId: startLocations[2].id, // Noida
        endLocationId: endLocations[1].id,    // Dehradun
        pickupPointId: pickupPoints[5].id,    // Sector 18
        dropPointId: dropPoints[4].id,        // Raiwala
        carId: cars[1].id,                    // Swift Dzire
        startTime: new Date('2025-10-19T09:00:00Z'),
        endTime: new Date('2025-10-21T15:00:00Z'),
        duration: '6 hours',
        status: true,
      },
    ]);

    console.log('✅ Trips created');

    // Create seat pricing for each trip
    for (const trip of trips) {
      const seatPricings = [
        { seatNumber: 'S1', seatType: 'window', price: 599 },
        { seatNumber: 'S2', seatType: 'middle', price: 499 },
        { seatNumber: 'S3', seatType: 'window', price: 549 },
        { seatNumber: 'S4', seatType: 'back', price: 449 },
        { seatNumber: 'S5', seatType: 'middle', price: 499 },
      ];

      for (const seat of seatPricings) {
        await SeatPricing.create({
          tripId: trip.id,
          seatNumber: seat.seatNumber,
          seatType: seat.seatType,
          price: seat.price,
          isBooked: false,
        });
      }
    }

    console.log('✅ Seat pricing records created');
    console.log('✅ New test data inserted successfully');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    // Close Sequelize connection
    await sequelize.close();
    console.log('🔒 Database connection closed');
    process.exit(0);
  }
}

seedDatabase();
