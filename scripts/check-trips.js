const { Sequelize, Op } = require('sequelize');
const config = require('../config/config.json').development;

const sequelize = new Sequelize({
  dialect: 'mysql',
  host: config.host,
  port: config.port,
  username: config.username,
  password: config.password,
  database: config.database,
  logging: console.log,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

async function checkRecurringTrips() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');

    // Get all trips that are marked as recurring
    const trips = await sequelize.query(
      `SELECT id, start_time, end_time, is_recurring, repeat_type, 
              start_location_id, end_location_id, pickup_points, drop_points
       FROM Trips 
       WHERE is_recurring = 1 
       AND start_location_id = 1 
       AND end_location_id = 9`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    console.log('\n🔍 Found recurring trips:');
    console.table(trips);

    // Helper function to safely parse points
    const parsePoints = (points) => {
      if (!points) return [];
      try {
        // If it's already an array, return it
        if (Array.isArray(points)) return points;
        // If it's a string that looks like an array, parse it
        if (typeof points === 'string') {
          // Handle both JSON and string array formats
          if (points.startsWith('[')) {
            return JSON.parse(points);
          }
          // Handle space-separated or comma-separated values
          const parsed = points.split(/[\s,]+/).filter(Boolean).map(Number);
          return parsed.length ? parsed : [];
        }
        return [];
      } catch (e) {
        console.warn('Error parsing points:', points, e);
        return [];
      }
    };

    // Check if any pickup point 7 and drop point 64 exist in the trips
    const relevantTrips = trips.map(trip => {
      const pickupPoints = parsePoints(trip.pickup_points);
      const dropPoints = parsePoints(trip.drop_points);
      return {
        ...trip,
        pickupPoints,
        dropPoints,
        hasPickup7: pickupPoints.includes(7),
        hasDrop64: dropPoints.includes(64)
      };
    }).filter(trip => trip.hasPickup7 && trip.hasDrop64);

    console.log('\n🚌 Trips with pickup point 7 and drop point 64:');
    console.table(relevantTrips);

    // Check if any of these trips should appear on 2025-11-24
    const searchDate = new Date('2025-11-24T00:00:00Z');
    const searchDay = searchDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    console.log('\n📅 Checking for trips on:', searchDate.toISOString().split('T')[0]);
    console.log('Day of week (0=Sun, 1=Mon, ...):', searchDay);
    
    const matchingTrips = relevantTrips.filter(trip => {
      const tripDate = new Date(trip.start_time);
      const tripDay = tripDate.getDay();
      return tripDay === searchDay;
    });

    console.log('\n✅ Trips that should appear on this day:');
    console.table(matchingTrips);

  } catch (error) {
    console.error('❌ Error checking trips:', error);
  } finally {
    await sequelize.close();
  }
}

checkRecurringTrips();
