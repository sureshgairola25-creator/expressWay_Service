const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Booking = sequelize.define('Booking', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  tripId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'trip_id',
    references: {
      model: 'Trips',
      key: 'id'
    }
  },
  seats: {
    type: DataTypes.JSON,
    allowNull: false,
    field: 'seats'
  },
  totalAmount: {
    type: DataTypes.FLOAT,
    allowNull: false,
    field: 'total_amount'
  },
  paymentStatus: {
    type: DataTypes.ENUM('pending', 'completed', 'failed'),
    defaultValue: 'pending',
    field: 'payment_status'
  },
  bookingStatus: {
    type: DataTypes.ENUM('confirmed', 'initiated', 'cancelled', 'completed'),
    defaultValue: 'initiated',
    field: 'booking_status'
  },
  paymentOrderId: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'payment_order_id',
    comment: 'Payment order ID from payment gateway'
  },
  paymentSessionId: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'payment_session_id',
    comment: 'Payment session ID from payment gateway'
  },
  paymentExpiry: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'payment_expiry',
    comment: 'When the payment session expires and seats should be released'
  },
  pickupPointId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'pickup_point_id',
    comment: 'The pickup point where the passenger will board',
    references: {
      model: 'PickupPoints',
      key: 'id'
    }
  },
  dropPointId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'drop_point_id',
    comment: 'The drop point where the passenger will alight',
    references: {
      model: 'DropPoints',
      key: 'id'
    }
  },
  selectedMeal: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'selected_meal',
    comment: 'Selected meal options for the booking'
  },
  priceBreakdown: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'price_breakdown',
    defaultValue: {}
  },
  journeyDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'journey_date',
    comment: 'The actual date of the journey for recurring trips'
  },
  
  // Future-proofing fields
  // couponId: {
  //   type: DataTypes.INTEGER,
  // },
  // passengerDetails: {
  //   type: DataTypes.JSON,
  // },
}, {
  // Model options
  tableName: 'Bookings',
  timestamps: true,
  underscored: false, // We're explicitly defining field names, so disable underscored
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['trip_id']
    },
    {
      fields: ['booking_status']
    },
    {
      fields: ['payment_status']
    }
  ]
});

// Associations (will be defined in index.js)
module.exports = Booking;
