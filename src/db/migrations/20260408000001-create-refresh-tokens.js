'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('RefreshTokens')) return;

    await queryInterface.createTable('RefreshTokens', {
      id:         { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      user_id:    { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE' },
      token:      { type: Sequelize.STRING(512), allowNull: false, unique: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      is_revoked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('RefreshTokens', ['user_id']);
    await queryInterface.addIndex('RefreshTokens', ['token'], { unique: true });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('RefreshTokens');
  },
};
