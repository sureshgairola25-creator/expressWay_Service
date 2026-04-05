const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Car = sequelize.define('Car', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  carName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  carType: {
    type: DataTypes.STRING,
  },
  class: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'standard',
    validate: {
      isIn: [['standard', 'premium', 'classic', 'luxury', 'business']]
    }
  },
  carUniqueNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true,
      len: [3, 20]
    }
  },
  totalSeats: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  registrationNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    // Removed unique constraint completely to avoid MySQL key limit issues
    // If uniqueness is needed, handle it in application logic
  },
  cabType: {
  type: DataTypes.ENUM('sharing', 'cabin', 'personalize'),
  allowNull: false,
  defaultValue: 'sharing',
  field: 'cab_type',
},
pricePerSeat: {
  type: DataTypes.DECIMAL(10, 2),
  allowNull: true,
  defaultValue: null,
  field: 'price_per_seat',
},
pricePerCabin: {
  type: DataTypes.DECIMAL(10, 2),
  allowNull: true,
  defaultValue: null,
  field: 'price_per_cabin',
},
cabinCapacity: {
  type: DataTypes.INTEGER,
  allowNull: true,
  defaultValue: null,
  field: 'cabin_capacity',
},
totalCabins: {
  type: DataTypes.INTEGER,
  allowNull: true,
  defaultValue: null,
  field: 'total_cabins',
},
pricePerCar: {
  type: DataTypes.DECIMAL(10, 2),
  allowNull: true,
  defaultValue: null,
  field: 'price_per_car',
},
imageUrl: {
  type: DataTypes.STRING(500),
  allowNull: true,
  defaultValue: null,
  field: 'image_url',
},
// ── New booking model (source of truth for new cars) ───────────────────────
// sharing_and_cabin : vehicle supports BOTH sharing AND cabin rides.
//                     Cabins are ALWAYS derived: floor(totalSeats / cabinCapacity).
//                     totalCabins is never stored.
// personalized      : full-vehicle booking only.
// NULL              : legacy car — derive intent from cabType / availableModes.
bookingMode: {
  type: DataTypes.ENUM('sharing_and_cabin', 'personalized'),
  allowNull: true,
  defaultValue: null,
  field: 'booking_mode',
  comment: 'sharing_and_cabin = sharing+cabin rides; personalized = full-vehicle only.',
},
// ── Multi-mode support: one vehicle can serve both sharing + cabin ──────────
// e.g. availableModes = ["sharing", "cabin"]
// NULL means use cabType only (backward-compatible)
availableModes: {
  type: DataTypes.JSON,
  allowNull: true,
  defaultValue: null,
  field: 'available_modes',
  comment: 'Ride modes this vehicle supports. NULL = use cabType only.'
},
// ── Category for personalized ride filtering ────────────────────────────────
// Values: Compact, Executive, Family, Grand
vehicleCategory: {
  type: DataTypes.ENUM('Compact', 'Executive', 'Family', 'Grand'),
  allowNull: true,
  defaultValue: null,
  field: 'vehicle_category',
  comment: 'Category used to filter personalized rides.'
},
}, {
  tableName: 'Cars',
  timestamps: true,
  underscored: true
});

module.exports = Car;
