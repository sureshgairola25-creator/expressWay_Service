'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Review extends Model {
    static associate(models) {
      // Define associations here
      Review.belongsTo(models.User, {
        foreignKey: 'user_id',
        targetKey: 'id',
        as: 'user'
      });
      
      Review.belongsTo(models.Booking, {
        foreignKey: 'booking_id',
        targetKey: 'id',
        as: 'booking'
      });
      
      Review.belongsTo(models.Trip, {
        foreignKey: 'trip_id',
        targetKey: 'id',
        as: 'trip'
      });
    }
  }
  
  Review.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      field: 'user_id',
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    bookingId: {
      type: DataTypes.INTEGER,
      field: 'booking_id',
      allowNull: false,
      unique: true,
      references: {
        model: 'Bookings',
        key: 'id'
      }
    },
    tripId: {
      type: DataTypes.INTEGER,
      field: 'trip_id',
      allowNull: false,
      references: {
        model: 'Trips',
        key: 'id'
      }
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 5
      }
    },
    feedback: {
      type: DataTypes.TEXT,
      allowNull: true,
      validate: {
        len: [0, 2000]
      },
      set(value) {
        if (value) {
          const escaped = value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
          this.setDataValue('feedback', escaped);
        }
      }
    },
  }, {
    sequelize,
    modelName: 'Review',
    tableName: 'Reviews',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',  
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'booking_id']
      }
    ]
  });

  return Review;
};
