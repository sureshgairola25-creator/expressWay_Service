// ── db/models/PickupPoint.js — UPDATED ───────────────────────────────────────
const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const PickupPoint = sequelize.define('PickupPoint', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },

  startLocationId: {
  type: DataTypes.INTEGER,
  allowNull: true,
  field: 'start_location_id'  // ← matches actual DB column
},

  status: { type: DataTypes.BOOLEAN, defaultValue: true },

  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: null,
    comment: 'Fixed price for this pickup. NULL = use car base price'
  },
  type: {
    type: DataTypes.ENUM('standard', 'metro', 'railway', 'airport'),
    defaultValue: 'standard'
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Short label e.g. "Pink / Blue Line"'
  },
  meta: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Display extras: metro line colors, badge, logoKey'
  },
  isCityDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_city_default',
    comment: 'If true, show for ALL start locations in city_default_for'
  },
  cityDefaultFor: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'city_default_for',
    comment: 'City slug this default applies to e.g. "delhi"'
  },
cabType: {
  type: DataTypes.ENUM('sharing', 'cabin', 'personalize', 'all'),
  defaultValue: 'all',
  field: 'cab_type',
},

}, {
  tableName: 'PickupPoints',
  timestamps: true,
  underscored: true
});

module.exports = PickupPoint;


// ── db/models/StartLocation.js — UPDATED ─────────────────────────────────────
// Add city field to existing model:
/*
  city: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'City slug e.g. "delhi", "dehradun" — used to attach city defaults'
  },
*/