const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { sequelize, Trip } = require("./src/db/models");

// Random array pick
const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Random time generator
const randomTime = (date) => {
  const d = new Date(date);
  d.setHours(Math.floor(Math.random() * 24));
  d.setMinutes(Math.floor(Math.random() * 60));
  return d;
};

// Add hours
const addHours = (date, hours) => {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
};

// Load CSV
async function loadCSV() {
  return new Promise((resolve) => {
    const rows = [];
    fs.createReadStream(path.join(__dirname, "results-2025-11-03-161657.csv"))
      .pipe(csv())
      .on("data", (data) => rows.push(data))
      .on("end", () => resolve(rows));
  });
}

// Generate a date inside last week / current week
function generateDateInWeek(weekOffset) {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 1 + weekOffset * 7); // Monday
  d.setDate(d.getDate() + Math.floor(Math.random() * 7));  // random day
  return d;
}

async function seedTrips() {
  console.log("🚀 Starting Trip Seeding...");

  await sequelize.authenticate();
  console.log("✅ DB Connected");

  const csvData = await loadCSV();
  console.log(`✅ Loaded ${csvData.length} CSV records`);

  const trips = [];

  // ✅ Generate exactly 20 trips
  for (let i = 0; i < 20; i++) {
    const row = randomItem(csvData);

    const weekOffset = i < 10 ? -1 : 0; // first 10 = last week
    const baseDate = generateDateInWeek(weekOffset);

    const startTime = randomTime(baseDate);
    const endTime = addHours(startTime, 24); // fixed 24 hour duration like your CSV

    trips.push({
      startLocationId: row.startLocationId,
      endLocationId: row.endLocationId,
      carId: row.carId,
      pickup_points: row.pickup_points,
      drop_points: row.drop_points,
      start_time: startTime,
      end_time: endTime,
      duration: row.duration || "24 hours",
      meals: row.meals || null,
      status: 1
    });
  }

  // ✅ Insert Trips
  try {
    await Trip.bulkCreate(trips);
    console.log("✅ Successfully inserted 20 trips!");
  } catch (err) {
    console.error("❌ Error inserting trips:", err);
  }

  await sequelize.close();
  console.log("🔒 DB connection closed");
  process.exit(0);
}

seedTrips();
