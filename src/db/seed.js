const db = require('./models');

const seed = async () => {
  try {
    // Clear existing data
    await db.sequelize.sync({ force: true });

    // Create Start Locations
    const delhi = await db.StartLocation.create({ name: 'New Delhi' });
    const rishikesh = await db.StartLocation.create({ name: 'Rishikesh (Nepali Farm)' });
    const noida = await db.StartLocation.create({ name: 'Noida' });

    // Create Pickup Points
    await db.PickupPoint.create({ name: 'Akshardham Metro', startLocationId: delhi.id });
    await db.PickupPoint.create({ name: 'ISBT Kashmiri Gate', startLocationId: delhi.id });
    await db.PickupPoint.create({ name: 'Nepali Farm', startLocationId: rishikesh.id });
    await db.PickupPoint.create({ name: 'Sector 18', startLocationId: noida.id });

    // Create End Locations
    const haridwar = await db.EndLocation.create({ name: 'Haridwar' });
    const dehradun = await db.EndLocation.create({ name: 'Dehradun' });
    const manali = await db.EndLocation.create({ name: 'Manali' });

    // Create Drop Points
    await db.DropPoint.create({ name: 'Har Ki Pauri', endLocationId: haridwar.id });
    await db.DropPoint.create({ name: 'ISBT Dehradun', endLocationId: dehradun.id });
    await db.DropPoint.create({ name: 'Mall Road', endLocationId: manali.id });

    // Create Routes
    await db.Route.create({ startLocationId: delhi.id, endLocationId: haridwar.id });
    await db.Route.create({ startLocationId: delhi.id, endLocationId: dehradun.id });
    await db.Route.create({ startLocationId: rishikesh.id, endLocationId: haridwar.id });
    await db.Route.create({ startLocationId: noida.id, endLocationId: manali.id });

    // Create Cars
    const car1 = await db.Car.create({ carName: 'Toyota Innova', carType: 'SUV', totalSeats: 7, registrationNumber: 'DL1CAB1234' });
    const car2 = await db.Car.create({ carName: 'Maruti Swift', carType: 'Hatchback', totalSeats: 5, registrationNumber: 'UP16AB5678' });

    // Create Trips
    const trip1 = await db.Trip.create({
      startLocation: 'New Delhi',
      endLocation: 'Haridwar',
      startTime: new Date('2025-11-15T08:00:00'),
      endTime: new Date('2025-11-15T14:00:00'),
      duration: '6 hours',
      farePerSeat: 800,
      availableSeats: 7,
      seatType: 'Standard',
      carId: car1.id,
    });

    const trip2 = await db.Trip.create({
      startLocation: 'Noida',
      endLocation: 'Manali',
      startTime: new Date('2025-11-20T20:00:00'),
      endTime: new Date('2025-11-21T08:00:00'),
      duration: '12 hours',
      farePerSeat: 2500,
      availableSeats: 5,
      seatType: 'Standard',
      carId: car2.id,
    });

    // Create Seats for Trip 1
    for (let i = 1; i <= car1.totalSeats; i++) {
      await db.Seat.create({
        seatNumber: `S${i}`,
        seatType: 'Standard',
        price: trip1.farePerSeat,
        tripId: trip1.id,
      });
    }

    // Create Seats for Trip 2
    for (let i = 1; i <= car2.totalSeats; i++) {
      await db.Seat.create({
        seatNumber: `S${i}`,
        seatType: 'Standard',
        price: trip2.farePerSeat,
        tripId: trip2.id,
      });
    }

    // Create a sample booking for Trip 1
    await db.Booking.create({
      userId: 1, // Dummy user ID
      tripId: trip1.id,
      seatNumbers: 'S1,S2',
      totalAmount: trip1.farePerSeat * 2,
      paymentStatus: 'success',
      bookingStatus: 'confirmed',
      pickupPoint: 'Akshardham Metro',
      dropPoint: 'Har Ki Pauri',
      boardingTime: trip1.startTime,
      droppingTime: trip1.endTime,
    });

    // Update the status of the booked seats for Trip 1
    await db.Seat.update(
      { status: 'booked' },
      { where: { tripId: trip1.id, seatNumber: ['S1', 'S2'] } }
    );

    // Update available seats on Trip 1
    await db.Trip.update(
      { availableSeats: trip1.availableSeats - 2 },
      { where: { id: trip1.id } }
    );

    console.log('✅ Database seeded successfully!');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    await db.sequelize.close();
  }
};

seed();
