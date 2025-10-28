const { sequelize, User, Trip, Booking, BookedSeat, SeatPricing } = require('./src/db/models');

async function seedBookingData() {
  try {
    console.log('🚀 Starting booking data seeding...');

    // Step 1: Create verified users for bookings
    console.log('📝 Creating verified users...');

    const users = await User.bulkCreate([
      {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phoneNo: '9876543210',
        password: '$2a$12$4bTPKxlLakQSW26OHkejnOt.KviEZzYNlSoiZBAKH9IlXZpNX9P1W', // "password123"
        provider: 'manual',
        isVerified: true,
        role: 'user',
        gender: 'Male',
        ageRange: '25-30',
      },
      {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
        phoneNo: '9876543211',
        password: '$2a$12$4bTPKxlLakQSW26OHkejnOt.KviEZzYNlSoiZBAKH9IlXZpNX9P1W', // "password123"
        provider: 'manual',
        isVerified: true,
        role: 'user',
        gender: 'Female',
        ageRange: '25-30',
      },
      {
        firstName: 'Mike',
        lastName: 'Johnson',
        email: 'mike.johnson@example.com',
        phoneNo: '9876543212',
        password: '$2a$12$4bTPKxlLakQSW26OHkejnOt.KviEZzYNlSoiZBAKH9IlXZpNX9P1W', // "password123"
        provider: 'manual',
        isVerified: true,
        role: 'user',
        gender: 'Male',
        ageRange: '30-35',
      },
      {
        firstName: 'Sarah',
        lastName: 'Wilson',
        email: 'sarah.wilson@example.com',
        phoneNo: '9876543213',
        password: '$2a$12$4bTPKxlLakQSW26OHkejnOt.KviEZzYNlSoiZBAKH9IlXZpNX9P1W', // "password123"
        provider: 'manual',
        isVerified: true,
        role: 'user',
        gender: 'Female',
        ageRange: '25-30',
      },
      {
        firstName: 'David',
        lastName: 'Brown',
        email: 'david.brown@example.com',
        phoneNo: '9876543214',
        password: '$2a$12$4bTPKxlLakQSW26OHkejnOt.KviEZzYNlSoiZBAKH9IlXZpNX9P1W', // "password123"
        provider: 'manual',
        isVerified: true,
        role: 'user',
        gender: 'Male',
        ageRange: '35-40',
      },
    ]);

    console.log(`✅ ${users.length} verified users created`);

    // Step 2: Get existing trips from database
    const trips = await Trip.findAll({
      include: [
        { model: require('./src/db/models/StartLocation'), as: 'startLocation' },
        { model: require('./src/db/models/EndLocation'), as: 'endLocation' },
      ],
      limit: 20 // Get first 20 trips for bookings
    });

    if (trips.length === 0) {
      console.log('⚠️ No trips found in database. Please run the main seeder first.');
      return;
    }

    console.log(`📋 Found ${trips.length} trips for booking`);

    // Step 3: Create bookings with realistic scenarios
    const bookings = [];
    const bookingScenarios = [
      { seats: ['S1'], paymentStatus: 'completed', bookingStatus: 'completed' },
      { seats: ['S1', 'S2'], paymentStatus: 'completed', bookingStatus: 'active' },
      { seats: ['S1', 'S2', 'S3'], paymentStatus: 'pending', bookingStatus: 'initiated' },
      { seats: ['S1'], paymentStatus: 'completed', bookingStatus: 'active' },
      { seats: ['S2', 'S3'], paymentStatus: 'failed', bookingStatus: 'cancelled' },
      { seats: ['S1', 'S4'], paymentStatus: 'completed', bookingStatus: 'completed' },
      { seats: ['S1'], paymentStatus: 'completed', bookingStatus: 'active' },
      { seats: ['S2'], paymentStatus: 'pending', bookingStatus: 'initiated' },
    ];

    let bookingCounter = 0;

    for (const trip of trips.slice(0, 15)) { // Create bookings for first 15 trips
      const scenario = bookingScenarios[bookingCounter % bookingScenarios.length];
      const user = users[bookingCounter % users.length];

      // Get seat pricing for this trip
      const seatPricingRecords = await SeatPricing.findAll({
        where: {
          tripId: trip.id,
          seatNumber: scenario.seats,
          isBooked: false
        }
      });

      if (seatPricingRecords.length === 0) continue;

      // Calculate total amount
      const totalAmount = seatPricingRecords.reduce((sum, seat) => sum + seat.price, 0);

      // Create booking
      const booking = await Booking.create({
        userId: user.id,
        tripId: trip.id,
        seats: scenario.seats,
        totalAmount,
        paymentStatus: scenario.paymentStatus,
        bookingStatus: scenario.bookingStatus,
      });

      bookings.push(booking);

      // Create BookedSeat records
      for (const seatPricing of seatPricingRecords) {
        await BookedSeat.create({
          bookingId: booking.id,
          tripId: trip.id,
          seatNumber: seatPricing.seatNumber,
          seatPrice: seatPricing.price,
          isCancelled: scenario.bookingStatus === 'cancelled',
        });

        // Mark seat as booked in SeatPricing
        await SeatPricing.update(
          { isBooked: true },
          { where: { id: seatPricing.id } }
        );
      }

      bookingCounter++;
    }

    console.log(`✅ ${bookings.length} bookings created`);

    // Step 4: Create additional random bookings for remaining trips
    for (const trip of trips.slice(15)) {
      const randomUser = users[Math.floor(Math.random() * users.length)];
      const availableSeats = await SeatPricing.findAll({
        where: {
          tripId: trip.id,
          isBooked: false
        },
        limit: Math.floor(Math.random() * 3) + 1 // 1-3 seats
      });

      if (availableSeats.length === 0) continue;

      const selectedSeats = availableSeats.slice(0, Math.min(availableSeats.length, 2));
      const totalAmount = selectedSeats.reduce((sum, seat) => sum + seat.price, 0);

      const booking = await Booking.create({
        userId: randomUser.id,
        tripId: trip.id,
        seats: selectedSeats.map(s => s.seatNumber),
        totalAmount,
        paymentStatus: Math.random() > 0.3 ? 'completed' : 'pending',
        bookingStatus: Math.random() > 0.2 ? 'active' : 'initiated',
      });

      // Create BookedSeat records
      for (const seatPricing of selectedSeats) {
        await BookedSeat.create({
          bookingId: booking.id,
          tripId: trip.id,
          seatNumber: seatPricing.seatNumber,
          seatPrice: seatPricing.price,
          isCancelled: false,
        });

        // Mark seat as booked
        await SeatPricing.update(
          { isBooked: true },
          { where: { id: seatPricing.id } }
        );
      }

      bookings.push(booking);
    }

    // Step 5: Create some cancelled bookings for testing
    console.log('📝 Creating cancelled bookings for testing...');

    const cancelledTrips = trips.slice(0, 3);
    for (const trip of cancelledTrips) {
      const user = users[Math.floor(Math.random() * users.length)];
      const cancelledSeats = await SeatPricing.findAll({
        where: {
          tripId: trip.id,
          isBooked: false
        },
        limit: 1
      });

      if (cancelledSeats.length > 0) {
        const seat = cancelledSeats[0];
        const booking = await Booking.create({
          userId: user.id,
          tripId: trip.id,
          seats: [seat.seatNumber],
          totalAmount: seat.price,
          paymentStatus: 'completed',
          bookingStatus: 'cancelled',
        });

        await BookedSeat.create({
          bookingId: booking.id,
          tripId: trip.id,
          seatNumber: seat.seatNumber,
          seatPrice: seat.price,
          isCancelled: true,
        });

        await SeatPricing.update(
          { isBooked: false },
          { where: { id: seat.id } }
        );

        bookings.push(booking);
      }
    }

    // Step 6: Log final summary
    const totalBookedSeats = await BookedSeat.count();
    const completedBookings = await Booking.count({ where: { paymentStatus: 'completed' } });
    const activeBookings = await Booking.count({ where: { bookingStatus: 'active' } });

    console.log(`\n🎉 BOOKING SEEDING COMPLETE!`);
    console.log(`📊 BOOKING SUMMARY:`);
    console.log(`✅ ${users.length} verified users created`);
    console.log(`✅ ${bookings.length} total bookings created`);
    console.log(`✅ ${completedBookings} completed bookings`);
    console.log(`✅ ${activeBookings} active bookings`);
    console.log(`✅ ${totalBookedSeats} booked seats`);
    console.log(`✅ Mix of payment statuses: completed, pending, failed`);
    console.log(`✅ Mix of booking statuses: active, initiated, cancelled, completed`);

    console.log(`\n💡 TEST CREDENTIALS:`);
    users.forEach((user, index) => {
      console.log(`   User ${index + 1}: ${user.email} / password123`);
    });

  } catch (error) {
    console.error('❌ Error seeding booking data:', error);
  } finally {
    // Close Sequelize connection
    await sequelize.close();
    console.log('🔒 Database connection closed');
    process.exit(0);
  }
}

seedBookingData();
