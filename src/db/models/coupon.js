'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Coupon extends Model {
    static associate(models) {
      // Define associations here
      this.hasMany(models.Booking, {
        foreignKey: 'couponId',
        as: 'bookings'
      });
    }

    static async isCodeUnique(code) {
      const coupon = await this.findOne({ where: { code: code.toUpperCase() } });
      return !coupon;
    }

    isActive() {
      const now = new Date();
      return (
        this.status &&
        new Date(this.start_date) <= now &&
        new Date(this.end_date) >= now
      );
    }

    isValidForAmount(amount) {
      if (this.min_order_amount && amount < this.min_order_amount) {
        return false;
      }
      return true;
    }

    calculateDiscount(amount) {
      if (!this.isActive() || !this.isValidForAmount(amount)) {
        return 0;
      }

      let discount = 0;
      
      if (this.discount_type === 'PERCENTAGE') {
        discount = (amount * this.discount_value) / 100;
        if (this.max_discount_amount && discount > this.max_discount_amount) {
          discount = this.max_discount_amount;
        }
      } else {
        discount = Math.min(this.discount_value, amount);
      }

      return parseFloat(Number(discount).toFixed(2));
    }
  }

  Coupon.init({
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      set(value) {
        this.setDataValue('code', value.toUpperCase());
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    discount_type: {
      type: DataTypes.ENUM('PERCENTAGE', 'FLAT'),
      allowNull: false,
      field: 'discount_type'
    },
    discount_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'discount_value',
      validate: {
        min: 0.01
      }
    },
    min_order_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'min_order_amount',
      validate: {
        min: 0
      }
    },
    max_discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'max_discount_amount',
      validate: {
        min: 0
      }
    },
    start_date: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'start_date'
    },
    end_date: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'end_date',
      validate: {
        isAfterStartDate(value) {
          if (new Date(value) <= new Date(this.start_date)) {
            throw new Error('End date must be after start date');
          }
        }
      }
    },
    status: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'status'
    },
    usage_limit_per_user: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'usage_limit_per_user',
      validate: {
        min: 1
      }
    },
    total_usage_limit: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'total_usage_limit',
      validate: {
        min: 1
      }
    },
    total_used: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_used',
      validate: {
        min: 0
      }
    },
    image_url: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'image_url'
    },
    // Timestamps are handled by Sequelize options below
  }, {
    sequelize,
    tableName: 'coupons',
    modelName: 'Coupon',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        name: 'coupons_status_start_date_end_date',
        fields: ['status', 'start_date', 'end_date']
      }
    ]
  });

  return Coupon;
};
