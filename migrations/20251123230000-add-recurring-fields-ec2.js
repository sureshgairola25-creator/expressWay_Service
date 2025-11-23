'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Add is_recurring column if it doesn't exist
      await queryInterface.sequelize.query(
        `ALTER TABLE Trips 
         ADD COLUMN IF NOT EXISTS is_recurring TINYINT(1) NOT NULL DEFAULT 0`,
        { transaction }
      );
      
      // Add repeat_type column if it doesn't exist
      await queryInterface.sequelize.query(
        `ALTER TABLE Trips 
         ADD COLUMN IF NOT EXISTS repeat_type ENUM('none', 'daily') NOT NULL DEFAULT 'none'`,
        { transaction }
      );
      
      await transaction.commit();
      console.log('✅ Successfully added recurring trip fields');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      await queryInterface.removeColumn('Trips', 'is_recurring', { transaction });
      await queryInterface.removeColumn('Trips', 'repeat_type', { transaction });
      await transaction.commit();
      console.log('✅ Successfully removed recurring trip fields');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Migration rollback failed:', error);
      throw error;
    }
  }
};
