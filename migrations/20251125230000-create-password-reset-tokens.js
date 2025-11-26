'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('PasswordResetTokens', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
        field: 'id'
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        field: 'userId',
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      tokenHash: {
        type: Sequelize.STRING(255),
        allowNull: false,
        field: 'tokenHash'
      },
      expiresAt: {
        type: Sequelize.DATE,
        allowNull: false,
        field: 'expiresAt'
      },
      used: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        field: 'used'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        field: 'createdAt',
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    }, {
      freezeTableName: true,
      timestamps: false
    });

    // Add index on tokenHash for faster lookups
    await queryInterface.addIndex('PasswordResetTokens', ['tokenHash'], {
      unique: true,
      name: 'idx_password_reset_tokens_token_hash',
    });

    // Add index on userId for faster queries when cleaning up old tokens
    await queryInterface.addIndex('PasswordResetTokens', ['userId'], {
      name: 'idx_password_reset_tokens_user_id',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('PasswordResetTokens');
  }
};
