const request = require('supertest');
const { app } = require('../app');
const { User, PasswordResetToken } = require('../src/db/models');
const bcrypt = require('bcryptjs');

// Mock the email sending function
jest.mock('../src/lib/email', () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true })
}));

describe('Password Reset Flow', () => {
  let testUser;
  const testPassword = 'TestPass123';
  const newPassword = 'NewPass123';
  let resetToken;

  beforeAll(async () => {
    // Create a test user
    testUser = await User.create({
      email: 'test@example.com',
      password: await bcrypt.hash(testPassword, 10),
      firstName: 'Test',
      lastName: 'User',
      isVerified: true
    });
  });

  afterAll(async () => {
    // Clean up test data
    await User.destroy({ where: {}, truncate: true });
    await PasswordResetToken.destroy({ where: {}, truncate: true });
    jest.clearAllMocks();
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    it('should return 200 and success message for valid email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: testUser.email });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('message', 'If this email exists, we have sent a reset link.');
    });

    it('should return 200 even for non-existent email (to prevent email enumeration)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
    });

    it('should create a reset token in the database', async () => {
      const token = await PasswordResetToken.findOne({
        where: { userId: testUser.id, used: false }
      });
      
      expect(token).toBeTruthy();
      expect(token.expiresAt).toBeInstanceOf(Date);
      expect(token.tokenHash).toBeTruthy();
      
      // Save token for the reset test
      resetToken = token;
    });
  });

  describe('POST /api/v1/auth/reset-password', () => {
    it('should return 400 for invalid token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'invalid-token',
          password: newPassword,
          confirmPassword: newPassword
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('message', 'Invalid or expired token');
    });

    it('should return 400 for mismatched passwords', async () => {
      // We need to get a valid token for this test
      const token = await PasswordResetToken.create({
        userId: testUser.id,
        tokenHash: await bcrypt.hash('test-token', 10),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes from now
      });

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'test-token',
          password: newPassword,
          confirmPassword: 'mismatched-password'
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('message', 'Passwords do not match');
    });

    it('should return 400 for weak password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'test-token',
          password: 'weak',
          confirmPassword: 'weak'
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.message).toContain('Password must be at least 8 characters');
    });

    it('should successfully reset password with valid token', async () => {
      // Create a valid token for testing
      const { token: rawToken, tokenHash } = await (async () => {
        const token = 'valid-test-token';
        const hash = await bcrypt.hash(token, 10);
        await PasswordResetToken.create({
          userId: testUser.id,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes from now
        });
        return { token, tokenHash: hash };
      })();

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: rawToken,
          password: newPassword,
          confirmPassword: newPassword
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('message', 'Password has been reset successfully');

      // Verify the token is marked as used
      const updatedToken = await PasswordResetToken.findOne({
        where: { tokenHash }
      });
      expect(updatedToken.used).toBe(true);

      // Verify the password was actually updated
      const updatedUser = await User.findByPk(testUser.id);
      const isPasswordValid = await bcrypt.compare(newPassword, updatedUser.password);
      expect(isPasswordValid).toBe(true);
    });

    it('should not allow reusing the same token', async () => {
      // The token from the previous test should now be marked as used
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'valid-test-token',
          password: 'AnotherNewPass123',
          confirmPassword: 'AnotherNewPass123'
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('message', 'Invalid or expired token');
    });
  });

  describe('Rate Limiting', () => {
    const testEmail = 'ratelimit@test.com';
    
    beforeAll(async () => {
      // Create a test user for rate limiting tests
      await User.create({
        email: testEmail,
        password: await bcrypt.hash('testpass', 10),
        firstName: 'Rate',
        lastName: 'Limit',
        isVerified: true
      });
    });

    it('should rate limit forgot password requests', async () => {
      // Make the maximum allowed requests
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(
          request(app)
            .post('/api/v1/auth/forgot-password')
            .send({ email: testEmail })
        );
      }
      
      await Promise.all(requests);
      
      // The next request should be rate limited
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: testEmail });
      
      expect(res.statusCode).toEqual(429);
    });
  });
});
