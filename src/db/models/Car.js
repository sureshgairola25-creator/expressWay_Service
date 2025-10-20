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
  totalSeats: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  registrationNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
}, {
  tableName: 'Cars',
});

module.exports = Car;
