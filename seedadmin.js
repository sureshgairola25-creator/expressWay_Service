const { sequelize, User } = require('./src/db/models');

async function seedAdminAccount() {
  try {
    console.log('🚀 Starting admin account seeding...');

    // Check if admin already exists
    const existingAdmin = await User.findOne({
      where: { role: 'admin' }
    });

    if (existingAdmin) {
      console.log('⚠️ Admin account already exists:', existingAdmin.email);
      return;
    }

    // Create admin user
    const adminUser = await User.create({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@expressway.com',
      phoneNo: '9999999999',
      password: '$2a$12$toTw/ZKRK4/7M/WecX/GYO9Pw4UihgfWqSz2gtN0owBRRLlbj6U.2', // "password123"
      provider: 'manual',
      isVerified: true,
      role: 'admin',
      gender: 'Male',
      ageRange: '30-35',
    });

    console.log('✅ Admin account created successfully');
    console.log(`📧 Email: ${adminUser.email}`);
    console.log(`🔑 Password: Suresh99@@`);
    console.log(`👤 Role: ${adminUser.role}`);
    console.log(`✅ Verified: ${adminUser.isVerified}`);
    console.log('');

  } catch (error) {
    console.error('❌ Error seeding admin account:', error);
  } finally {
    // Close Sequelize connection
    await sequelize.close();
    console.log('🔒 Database connection closed');
    process.exit(0);
  }
}

seedAdminAccount();
