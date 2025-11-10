// services/adminService.js
const { Op, Sequelize } = require('sequelize');
const { Booking, Trip, User, Car, StartLocation, EndLocation, sequelize } = require('../db/models');
const adminService = {
    fetchDashboardStats: async () => {
  // 1) totals
  const [totalUsers, totalBookings, totalTrips, totalCars] = await Promise.all([
    User.count({where: {role: 'user'}}),
    Booking.count(),
    Trip.count(),
    Car.count(),
  ]);

  // 2) trips per week (group by YEARWEEK of trip.startTime)
  // NOTE: YEARWEEK returns number YYYYWW - we'll map to "YYYY-WW"
  const tripsPerWeekRaw = await Trip.findAll({
    attributes: [
      [Sequelize.fn('YEARWEEK', Sequelize.col('start_time'), 1), 'yearweek'],
      [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
    ],
    group: [Sequelize.fn('YEARWEEK', Sequelize.col('start_time'), 1)],
    order: [[Sequelize.fn('YEARWEEK', Sequelize.col('start_time'), 1), 'ASC']],
    raw: true,
  });

  const tripsPerWeek = tripsPerWeekRaw.map(r => {
    const yw = String(r.yearweek);
    // convert to readable label "YYYY-WW"
    const year = yw.slice(0, 4);
    const week = yw.slice(4).padStart(2, '0');
    return { week: `${year}-W${week}`, count: Number(r.count) };
  });

  // 3) revenue by route: sum totalAmount per (start->end)
  // join Booking->Trip->StartLocation & EndLocation, group by start+end
  const revenueByRouteRaw = await Booking.findAll({
    attributes: [
      [Sequelize.literal("CONCAT(`Trip->startLocation`.`name`, ' → ', `Trip->endLocation`.`name`)"), 'route'],
      [Sequelize.fn('SUM', Sequelize.col('Booking.total_amount')), 'total'],
    ],
    include: [
      {
        model: Trip,
        attributes: [],
        include: [
          { model: StartLocation, as: 'startLocation', attributes: [] },
          { model: EndLocation, as: 'endLocation', attributes: [] },
        ],
      },
    ],
    group: [Sequelize.literal("route")],
    order: [[Sequelize.fn('SUM', Sequelize.col('Booking.total_amount')), 'DESC']],
    raw: true,
  });

  const revenueByRoute = revenueByRouteRaw.map(r => ({
    route: r.route,
    total: Number(r.total),
  }));

  return {
    totalUsers,
    totalBookings,
    totalTrips,
    totalCars,
    tripsPerWeek,
    revenueByRoute,
  };
    }
};
module.exports = adminService;
