const mongoose = require("mongoose");

const routeSchema = new mongoose.Schema({
  start: { type: String, required: true },
  end: { type: String, required: true },
  distance: { type: Number, default: 0 },
  pricePerKm: { type: Number, default: 10 },
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model("Route", routeSchema);
