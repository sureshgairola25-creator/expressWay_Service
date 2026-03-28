// src/db/models/notification.js

'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize,DataTypes ) => {
  class Notification extends Model {
    static associate(models) {
      Notification.belongsTo(models.Booking, { foreignKey: 'bookingId', as: 'booking' });
      Notification.belongsTo(models.User,    { foreignKey: 'userId',    as: 'user'    });
    }
  }

  Notification.init(
    {
      id: {
        type:          DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey:    true,
      },
      bookingId: {
        type:      DataTypes.INTEGER,
        allowNull: false,
        field:     'booking_id',
      },
      userId: {
        type:      DataTypes.INTEGER,
        allowNull: false,
        field:     'user_id',
      },
      phone: {
        type:      DataTypes.STRING(20),
        allowNull: false,
      },
      type: {
        type:         DataTypes.STRING(50),
        allowNull:    false,
        // 'booking_confirmed' | 'booking_cancelled' | 'trip_reminder'
      },
      status: {
        type:         DataTypes.STRING(20),
        allowNull:    false,
        defaultValue: 'pending',
        // 'pending' | 'sent' | 'failed'
      },
      messageSid: {
        type:      DataTypes.STRING(100),
        allowNull: true,
        field:     'message_sid',
      },
      attemptCount: {
        type:         DataTypes.INTEGER,
        allowNull:    false,
        defaultValue: 0,
        field:        'attempt_count',
      },
      lastError: {
        type:      DataTypes.TEXT,
        allowNull: true,
        field:     'last_error',
      },
      scheduledFor: {
        type:      DataTypes.DATE,
        allowNull: true,
        field:     'scheduled_for',
      },
      sentAt: {
        type:      DataTypes.DATE,
        allowNull: true,
        field:     'sent_at',
      },
    },
    {
      sequelize,
      modelName:  'Notification',
      tableName:  'Notifications',
      timestamps: true,               // adds createdAt + updatedAt automatically
      underscored: true,              // maps createdAt → created_at in DB
    }
  );

  return Notification;
};