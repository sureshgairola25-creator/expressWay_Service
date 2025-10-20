const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Trip = sequelize.define('Trip', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  startLocationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  endLocationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  pickupPointId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  dropPointId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  carId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  startTime: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  duration: {
    type: DataTypes.STRING,
  },
  status: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'Trips',
});

// Define associations
Trip.belongsTo(require('./StartLocation'), { foreignKey: 'startLocationId', as: 'startLocation' });
Trip.belongsTo(require('./EndLocation'), { foreignKey: 'endLocationId', as: 'endLocation' });
Trip.belongsTo(require('./PickupPoint'), { foreignKey: 'pickupPointId', as: 'pickupPoint' });
Trip.belongsTo(require('./DropPoint'), { foreignKey: 'dropPointId', as: 'dropPoint' });

module.exports = Trip;
