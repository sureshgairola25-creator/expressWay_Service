const { DataTypes } = require('sequelize');
const sequelize = require('../database');

// Stores long-lived refresh tokens (7d) so they can be revoked on logout.
// Access tokens are short-lived (15m) and stateless — they are NOT stored here.
const RefreshToken = sequelize.define('RefreshToken', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id',
  },
  token: {
    type: DataTypes.STRING(512),
    allowNull: false,
    unique: true,
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'expires_at',
  },
  isRevoked: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_revoked',
  },
}, {
  tableName: 'RefreshTokens',
  timestamps: true,
  underscored: true,
});

module.exports = RefreshToken;
