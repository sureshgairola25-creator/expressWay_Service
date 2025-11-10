'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Coupon extends Model {
    static associate(models) {
      // Define associations here
      Coupon.hasMany(models.Booking, {
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
        new Date(this.startDate) <= now &&
        new Date(this.endDate) >= now
      );
    }

    isValidForAmount(amount) {
      if (this.minOrderAmount && amount < this.minOrderAmount) {
        return false;
      }
      return true;
    }

    calculateDiscount(amount) {
      if (!this.isActive() || !this.isValidForAmount(amount)) {
        return 0;
      }

      let discount = 0;
      
      if (this.discountType === 'PERCENTAGE') {
        discount = (amount * this.discountValue) / 100;
        if (this.maxDiscountAmount && discount > this.maxDiscountAmount) {
          discount = this.maxDiscountAmount;
        }
      } else {
        discount = Math.min(this.discountValue, amount);
      }

      return parseFloat(discount.toFixed(2));
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
    discountType: {
      type: DataTypes.ENUM('PERCENTAGE', 'FLAT'),
      allowNull: false
    },
    discountValue: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0.01
      }
    },
    minOrderAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      validate: {
        min: 0
      }
    },
    maxDiscountAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      validate: {
        min: 0
      }
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: false,
      validate: {
        isAfterStartDate(value) {
          if (new Date(value) <= new Date(this.startDate)) {
            throw new Error('End date must be after start date');
          }
        }
      }
    },
    status: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    usageLimitPerUser: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1
      }
    },
    totalUsageLimit: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1
      }
    },
    totalUsed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    imageUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isUrl: true
      }
    }
  }, {
    sequelize,
    modelName: 'Coupon',
    tableName: 'Coupons',
    timestamps: true,
    paranoid: false,
    indexes: [
      {
        fields: ['code'],
        unique: true
      },
      {
        fields: ['status', 'startDate', 'endDate']
      }
    ]
  });

  return Coupon;
};
