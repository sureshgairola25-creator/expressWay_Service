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
      password: '$2a$12$k.xT3wFo95qBpDzPkWQpwuDfBq0ocX.34Fecq1Bkw1fmoP/vBpkiy', // "password123"
      provider: 'manual',
      isVerified: true,
      role: 'admin',
      gender: 'Male',
      ageRange: '30-35',
    });

    console.log('✅ Admin account created successfully');
    console.log(`📧 Email: ${adminUser.email}`);
    console.log(`🔑 Password: password123`);
    console.log(`👤 Role: ${adminUser.role}`);
    console.log(`✅ Verified: ${adminUser.isVerified}`);

    // Create additional admin accounts for testing
    const additionalAdmins = await User.bulkCreate([
      {
        firstName: 'System',
        lastName: 'Administrator',
        email: 'system@expressway.com',
        phoneNo: '9999999997',
        password: '$2a$12$4bTPKxlLakQSW26OHkejnOt.KviEZzYNlSoiZBAKH9IlXZpNX9P1W', // "password123"
        provider: 'manual',
        isVerified: true,
        role: 'admin',
        gender: 'Male',
        ageRange: '35-40',
      }
    ]);

    console.log(`✅ ${additionalAdmins.length} additional admin accounts created`);

    // Log all admin credentials
    console.log('\n🎉 ADMIN SEEDING COMPLETE!');
    console.log('📊 ADMIN ACCOUNTS CREATED:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👑 MAIN ADMIN:');
    console.log(`   Email: admin@expressway.com`);
    console.log(`   Password: password123`);
    console.log(`   Name: Admin User`);
    console.log(`   Phone: 9999999999`);
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
