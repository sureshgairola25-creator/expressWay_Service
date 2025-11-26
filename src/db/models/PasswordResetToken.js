const { DataTypes } = require('sequelize');
const sequelize = require('../database');
const User = require('./User');

const PasswordResetToken = sequelize.define('PasswordResetToken', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'userId',
    references: {
      model: 'Users',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  tokenHash: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'tokenHash'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'expiresAt'
  },
  used: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
    field: 'used'
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'createdAt',
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'PasswordResetTokens',
  timestamps: false, // We're handling timestamps manually
  underscored: false, // Prevent Sequelize from converting to snake_case
  freezeTableName: true // Prevent pluralization
});

// Define association
PasswordResetToken.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(PasswordResetToken, { foreignKey: 'userId' });

module.exports = PasswordResetToken;
