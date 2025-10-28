const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isEmail: true,
    },
  },
  phoneNo: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  password: {
    type: DataTypes.STRING,
  },
  provider: {
    type: DataTypes.ENUM('manual', 'google'),
    allowNull: false,
    defaultValue: 'manual',
  },
  googleId: {
    type: DataTypes.STRING,
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  role: {
    type: DataTypes.ENUM('user', 'admin'),
    allowNull: false,
    defaultValue: 'user',
  },
  dob: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  gender: {
    type: DataTypes.ENUM('Male', 'Female', 'Other'),
    allowNull: true,
  },
  ageRange: {
    type: DataTypes.ENUM('18-25', '25-30', '30-35','35-40','40-50','50-60'),
    allowNull: true,
  },
  profilePicture: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  token: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  tokenExpiration: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'Users',
});

module.exports = User;
