'use strict';

// Migration: add cab_type column to DropPoints
//
// DropPoints previously had no namespace field, which meant uniqueness could
// only be enforced globally by name+endLocationId. With cab_type we can apply
// the same two-namespace rule used by PickupPoints:
//   • sharing + cabin → same namespace (cab_type IN ('sharing','cabin','all'))
//   • personalize     → separate namespace (cab_type IN ('personalize','all'))
//
// All existing rows are safe: they default to 'all', which continues to be
// served for every trip type (no data broken).

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('DropPoints');

    if (!tableDescription.cab_type) {
      await queryInterface.addColumn('DropPoints', 'cab_type', {
        type: Sequelize.ENUM('sharing', 'cabin', 'personalize', 'all'),
        allowNull: false,
        defaultValue: 'all',
        comment: 'Namespace: sharing+cabin share one namespace, personalize is separate',
        after: 'status',   // MySQL only — ignored on other dialects
      });
    }
  },

  down: async (queryInterface) => {
    const tableDescription = await queryInterface.describeTable('DropPoints');
    if (tableDescription.cab_type) {
      await queryInterface.removeColumn('DropPoints', 'cab_type');
    }
  },
};
