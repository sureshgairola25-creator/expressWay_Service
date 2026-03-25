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
}, {
  tableName: 'Cars',
  timestamps: true,
  underscored: true
});

module.exports = Car;
