const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const BackgroundImage = sequelize.define('BackgroundImage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  filename: {
    type: DataTypes.STRING,
    allowNull: false
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'background_images',
  timestamps: false
});

module.exports = BackgroundImage;
