'use strict';

/**
 * Migration: add seat-inventory snapshot columns to Trips
 *
 * available_seats        — live counter; decremented on each booking
 * total_seats_snapshot   — car.totalSeats at trip-creation time
 * seats_per_cabin_snapshot — car.cabinCapacity at trip-creation time (NULL for personalized)
 * booking_mode_snapshot  — car.bookingMode at trip-creation time
 *
 * Backfill: existing trips are seeded from their Car relation so the counter
 * starts at the correct value instead of NULL.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('Trips');

    if (!desc.available_seats) {
      await queryInterface.addColumn('Trips', 'available_seats', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        after: 'car_id',
      });
    }

    if (!desc.total_seats_snapshot) {
      await queryInterface.addColumn('Trips', 'total_seats_snapshot', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        after: 'available_seats',
      });
    }

    if (!desc.seats_per_cabin_snapshot) {
      await queryInterface.addColumn('Trips', 'seats_per_cabin_snapshot', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        after: 'total_seats_snapshot',
      });
    }

    if (!desc.booking_mode_snapshot) {
      await queryInterface.addColumn('Trips', 'booking_mode_snapshot', {
        type: Sequelize.ENUM('sharing_and_cabin', 'personalized'),
        allowNull: true,
        defaultValue: null,
        after: 'seats_per_cabin_snapshot',
      });
    }

    // Backfill existing trips from their car
    await queryInterface.sequelize.query(`
      UPDATE Trips t
      JOIN Cars c ON c.id = t.car_id
      SET
        t.total_seats_snapshot      = c.total_seats,
        t.seats_per_cabin_snapshot  = c.cabin_capacity,
        t.booking_mode_snapshot     = COALESCE(
          c.booking_mode,
          CASE
            WHEN c.cab_type IN ('sharing','cabin') THEN 'sharing_and_cabin'
            WHEN c.cab_type = 'personalize'        THEN 'personalized'
            ELSE NULL
          END
        ),
        t.available_seats = CASE
          WHEN COALESCE(c.booking_mode,
            CASE
              WHEN c.cab_type IN ('sharing','cabin') THEN 'sharing_and_cabin'
              WHEN c.cab_type = 'personalize'        THEN 'personalized'
              ELSE NULL
            END
          ) = 'personalized' THEN 1
          ELSE c.total_seats
        END
      WHERE t.available_seats IS NULL
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Trips', 'available_seats');
    await queryInterface.removeColumn('Trips', 'total_seats_snapshot');
    await queryInterface.removeColumn('Trips', 'seats_per_cabin_snapshot');
    await queryInterface.removeColumn('Trips', 'booking_mode_snapshot');
  },
};
