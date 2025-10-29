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

    // Helper function to get random element from array
    const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // Helper function to generate random time for today
    const getRandomTimeToday = (startHour, endHour) => {
      const today = new Date();
      const hour = Math.floor(Math.random() * (endHour - startHour)) + startHour;
      const minute = Math.floor(Math.random() * 60);
      today.setHours(hour, minute, 0, 0);
      return today;
    };

    // Helper function to calculate end time based on duration
    const addHours = (date, hours) => {
      const result = new Date(date);
      result.setHours(result.getHours() + hours);
      return result;
    };

    // Create start locations
    const startLocations = await StartLocation.bulkCreate([
      { name: 'New Delhi', status: true },
      { name: 'Gurgaon', status: true },
      { name: 'Noida', status: true },
      { name: 'Faridabad', status: true },
      { name: 'Ghaziabad', status: true },
    ]);

    // Create pickup points
    const pickupPoints = await PickupPoint.bulkCreate([
      { name: 'Botanical Garden', startLocationId: startLocations[0].id, status: true },
      { name: 'Sector 62', startLocationId: startLocations[0].id, status: true },
      { name: 'Akshardham', startLocationId: startLocations[0].id, status: true },
      { name: 'Cyber City', startLocationId: startLocations[1].id, status: true },
      { name: 'Golf Course Road', startLocationId: startLocations[1].id, status: true },
      { name: 'Sector 18', startLocationId: startLocations[2].id, status: true },
      { name: 'Sector 15', startLocationId: startLocations[2].id, status: true },
      { name: 'Sector 37', startLocationId: startLocations[3].id, status: true },
      { name: 'Neharpar', startLocationId: startLocations[4].id, status: true },
    ]);

    // Create end locations
    const endLocations = await EndLocation.bulkCreate([
      { name: 'Rishikesh', startLocationId: startLocations[0].id, status: true },
      { name: 'Dehradun', startLocationId: startLocations[0].id, status: true },
      { name: 'Haridwar', startLocationId: startLocations[1].id, status: true },
      { name: 'Mussoorie', startLocationId: startLocations[1].id, status: true },
      { name: 'Chandigarh', startLocationId: startLocations[2].id, status: true },
      { name: 'Shimla', startLocationId: startLocations[3].id, status: true },
      { name: 'Manali', startLocationId: startLocations[4].id, status: true },
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
      { name: 'Sector 17', endLocationId: endLocations[4].id, status: true },
      { name: 'Rock Garden', endLocationId: endLocations[4].id, status: true },
      { name: 'The Ridge', endLocationId: endLocations[5].id, status: true },
      { name: 'Mall Road Shimla', endLocationId: endLocations[5].id, status: true },
      { name: 'Old Manali', endLocationId: endLocations[6].id, status: true },
      { name: 'Solang Valley', endLocationId: endLocations[6].id, status: true },
    ]);

    console.log('✅ Locations created');

    // Create cars with different types and capacities
    const carTypes = [
      { name: 'Innova Crysta', type: 'SUV', class: 'premium', seats: 7, basePrice: 15 },
      { name: 'Swift Dzire', type: 'Sedan', class: 'standard', seats: 5, basePrice: 12 },
      // { name: 'Honda City', type: 'Sedan', class: 'standard', seats: 5, basePrice: 14 },
      // { name: 'Toyota Fortuner', type: 'SUV', class: 'luxury', seats: 7, basePrice: 18 },
      // { name: 'Maruti Alto', type: 'Hatchback', class: 'standard', seats: 4, basePrice: 10 },
      // { name: 'Hyundai Creta', type: 'SUV', class: 'premium', seats: 5, basePrice: 13 },
      // { name: 'Mahindra XUV500', type: 'SUV', class: 'luxury', seats: 7, basePrice: 16 },
      // { name: 'Volkswagen Vento', type: 'Sedan', class: 'standard', seats: 5, basePrice: 13 },
      // { name: 'Renault Triber', type: 'MPV', class: 'standard', seats: 7, basePrice: 11 },
      // { name: 'Tata Nexon', type: 'SUV', class: 'premium', seats: 5, basePrice: 12 },
    ];

    const cars = [];
    let registrationCounter = 1000;

    // Create multiple cars of each type
    let carCounter = 1;
    for (const carType of carTypes) {
      for (let i = 0; i < 1; i++) { // 1 car of each type
        const regNumber = `DL${String(registrationCounter++).padStart(2, '0')}CA${String(Math.floor(Math.random() * 9000) + 1000).padStart(4, '0')}`;
        cars.push({
          carName: carType.name,
          carType: carType.type,
          class: carType.class,
          totalSeats: carType.seats,
          registrationNumber: regNumber,
          carUniqueNumber: `CAR-${String(carCounter++).padStart(3, '0')}-${regNumber.substring(0, 4)}`,
        });
      }
    }

    const createdCars = await Car.bulkCreate(cars);
    console.log(`✅ ${createdCars.length} cars created`);

    // Generate 50 trips for today
    const trips = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tripRoutes = [
      { start: 0, end: 0, duration: 6, pickupRange: [0, 3], dropRange: [0, 3] },
      { start: 0, end: 1, duration: 7, pickupRange: [0, 3], dropRange: [3, 5] },
      { start: 1, end: 2, duration: 5, pickupRange: [3, 5], dropRange: [5, 7] },
      { start: 1, end: 3, duration: 8, pickupRange: [3, 5], dropRange: [7, 9] },
      { start: 2, end: 4, duration: 4, pickupRange: [5, 7], dropRange: [9, 11] },
      { start: 3, end: 5, duration: 6, pickupRange: [7, 8], dropRange: [11, 13] },
      { start: 4, end: 6, duration: 9, pickupRange: [8, 9], dropRange: [13, 15] },
    ];

    let tripCounter = 0;
    const tripsPerRoute = Math.ceil(50 / tripRoutes.length);

    for (const route of tripRoutes) {
      for (let i = 0; i < tripsPerRoute && tripCounter < 50; i++) {
        const startTime = getRandomTimeToday(5, 22); // Random time between 5 AM and 10 PM
        const endTime = addHours(startTime, route.duration);

        // Get random pickup and drop points for this route
        const pickupRange = pickupPoints.slice(route.pickupRange[0], route.pickupRange[1]);
        const dropRange = dropPoints.slice(route.dropRange[0], route.dropRange[1]);
        const pickupPoint = getRandomElement(pickupRange);
        const dropPoint = getRandomElement(dropRange);

        // Create 5-6 cars for this trip (each car gets its own trip record)
        const carsForTrip = createdCars.slice(0, 50).sort(() => 0.5 - Math.random()).slice(0, Math.floor(Math.random() * 2) + 5); // 5-6 cars

        for (const car of carsForTrip) {
          if (tripCounter >= 50) break;

          trips.push({
            startLocationId: startLocations[route.start].id,
            endLocationId: endLocations[route.end].id,
            pickupPointId: pickupPoint.id,
            dropPointId: dropPoint.id,
            carId: car.id,
            startTime,
            endTime,
            duration: `${route.duration} hours`,
            status: true,
          });

          tripCounter++;
        }
      }
    }

    // const createdTrips = await Trip.bulkCreate(trips);
    // console.log(`✅ ${createdTrips.length} trips created for ${today.toDateString()}`);

    // Create seat pricing for each trip
    let totalSeatsCreated = 0;

    // for (const trip of createdTrips) {
    //   // Find the car for this trip to get seat count
    //   const car = createdCars.find(c => c.id === trip.carId);
    //   const seatCount = Math.min(car.totalSeats, Math.floor(Math.random() * 3) + 4); // 4-6 seats per car

    //   // Generate seat types and prices based on car type
    //   const seatTypes = ['window', 'middle', 'aisle', 'back'];
    //   const basePrice = car.carType === 'SUV' ? 18 :
    //                    car.carType === 'Sedan' ? 14 :
    //                    car.carType === 'Hatchback' ? 10 :
    //                    car.carType === 'MPV' ? 12 : 15;

    //   for (let i = 1; i <= seatCount; i++) {
    //     const seatType = getRandomElement(seatTypes);
    //     const priceMultiplier = seatType === 'window' ? 1.2 :
    //                           seatType === 'middle' ? 0.9 :
    //                           seatType === 'back' ? 0.8 : 1.0;
    //     const price = Math.round(basePrice * priceMultiplier * 100) / 100;

    //     await SeatPricing.create({
    //       tripId: trip.id,
    //       seatNumber: `S${i}`,
    //       seatType,
    //       price,
    //       isBooked: false,
    //     });

    //     totalSeatsCreated++;
    //   }
    // }

    // console.log(`✅ ${totalSeatsCreated} seat pricing records created`);

    // Log final summary
    const todayDate = today.toISOString().split('T')[0];
    console.log(`\n🎉 SEEDING COMPLETE!`);
    console.log(`📊 SUMMARY FOR ${todayDate}:`);
    console.log(`✅ ${createdTrips.length} trips created`);
    console.log(`✅ ${createdCars.length} cars available`);
    console.log(`✅ ${totalSeatsCreated} seats priced`);
    console.log(`✅ All trips scheduled for ${today.toDateString()}`);

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
