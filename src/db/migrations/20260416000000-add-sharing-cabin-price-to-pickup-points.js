'use strict';

// Migration: add sharing_price and cabin_price columns to PickupPoints
//
// Previously a PickupPoint had a single `price` field regardless of trip type.
// The new requirement allows one pickup point to support both Sharing AND Cabin
// trips simultaneously with different prices for each.
//
// Strategy:
//   • sharing_price — price override for Sharing trips (nullable)
//   • cabin_price   — price override for Cabin trips   (nullable)
//   • legacy `price` field is kept as-is; booking service falls back to it
//     if no type-specific price is set (full backward compatibility)
//
// Existing rows are unaffected — both new columns default to NULL.

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('PickupPoints');

    if (!tableDescription.sharing_price) {
      await queryInterface.addColumn('PickupPoints', 'sharing_price', {
        type:         Sequelize.DECIMAL(10, 2),
        allowNull:    true,
        defaultValue: null,
        comment:      'Price override for Sharing trips. NULL = fall back to `price` field',
        after:        'price',   // MySQL only — ignored on other dialects
      });
    }

    if (!tableDescription.cabin_price) {
      await queryInterface.addColumn('PickupPoints', 'cabin_price', {
        type:         Sequelize.DECIMAL(10, 2),
        allowNull:    true,
        defaultValue: null,
        comment:      'Price override for Cabin trips. NULL = fall back to `price` field',
        after:        'sharing_price',
      });
    }
  },

  down: async (queryInterface) => {
    const tableDescription = await queryInterface.describeTable('PickupPoints');

    if (tableDescription.sharing_price) {
      await queryInterface.removeColumn('PickupPoints', 'sharing_price');
    }
    if (tableDescription.cabin_price) {
      await queryInterface.removeColumn('PickupPoints', 'cabin_price');
    }
  },
};
