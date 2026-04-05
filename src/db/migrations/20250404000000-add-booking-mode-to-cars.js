'use strict';

/**
 * Migration: add booking_mode to Cars
 *
 * New model:
 *   sharing_and_cabin — vehicle supports BOTH sharing AND cabin bookings.
 *                       Cabins are ALWAYS derived: floor(totalSeats / cabinCapacity).
 *                       totalCabins is never stored.
 *   personalized      — full-vehicle booking only.
 *
 * Backward compatibility:
 *   Existing rows are backfilled from cab_type:
 *     'sharing' | 'cabin'  → 'sharing_and_cabin'
 *     'personalize'        → 'personalized'
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('Cars');

    if (!desc.booking_mode) {
      await queryInterface.addColumn('Cars', 'booking_mode', {
        type: Sequelize.ENUM('sharing_and_cabin', 'personalized'),
        allowNull: true,
        defaultValue: null,
        after: 'cab_type',
        comment: 'sharing_and_cabin = sharing+cabin rides; personalized = full-vehicle only.',
      });
    }

    // Backfill existing rows so the new field is never NULL for legacy cars
    await queryInterface.sequelize.query(`
      UPDATE Cars
      SET booking_mode = CASE
        WHEN cab_type IN ('sharing', 'cabin') THEN 'sharing_and_cabin'
        WHEN cab_type = 'personalize'         THEN 'personalized'
        ELSE NULL
      END
      WHERE booking_mode IS NULL
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Cars', 'booking_mode');
  },
};
