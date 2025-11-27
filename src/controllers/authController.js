const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op, Sequelize } = require('sequelize');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const sequelize = require('../db/database');
const { sendEmail } = require('../lib/email');
const User = require('../db/models/User');
const PasswordResetToken = require('../db/models/PasswordResetToken');

// Configuration
const TOKEN_EXPIRY_MINUTES = parseInt(process.env.RESET_TOKEN_EXPIRY_MINUTES) || 30;
const SALT_ROUNDS = 10;

/**
 * Generate a secure random token and its hash
 * @returns {Promise<{token: string, tokenHash: string}>}
 */
const generateResetToken = async () => {
  const token = crypto.randomBytes(48).toString('hex');
  const tokenHash = await bcrypt.hash(token, SALT_ROUNDS);
  return { token, tokenHash };
};

/**
 * Send password reset email
 * @param {string} email - User's email
 * @param {string} token - Reset token
 * @returns {Promise<{success: boolean, error?: string}>}
 */
const sendPasswordResetEmail = async (email, token) => {
  try {
    // Default to http://localhost:3000 if FRONTEND_URL is not set
    const frontendUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    const subject = 'Password Reset Request';
    // const message = `Click the following link to reset your password: ${resetUrl}\n\nThis link will expire in ${TOKEN_EXPIRY_MINUTES} minutes.`;
    const message = `
  <div style="font-family: Arial; font-size: 15px;">
    <p>Click the link below to reset your password:</p>

    <a href="${resetUrl}" 
       style="color: #1a73e8; text-decoration: underline; font-weight: bold;">
       Click here
    </a>

    <p>This link will expire in 30 minutes.</p>
  </div>
`;

    // Use the same email sending function as in the signup process
    return await sendEmail(email, subject, message);
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to send password reset email' 
    };
  }
};

/**
 * Handle forgot password request
 * @route POST /auth/forgot-password
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    // Find user by email (case-insensitive search for MySQL)
    const user = await User.findOne({
      where: { 
        email: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), 'LIKE', '%' + email.toLowerCase() + '%')
      },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      console.log(`Password reset requested for non-existent email: ${email}`);
      return res.status(200).json({
        success: true,
        message: 'If this email exists, we have sent a reset link.',
      });
    }

    // Generate reset token
    const { token, tokenHash } = await generateResetToken();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + TOKEN_EXPIRY_MINUTES);

    // Start a transaction
    const transaction = await PasswordResetToken.sequelize.transaction();

    try {
      // Invalidate any existing tokens for this user
      await PasswordResetToken.update(
        { used: true },
        {
          where: { userId: user.id, used: false },
          transaction,
        }
      );

      // Create new token
      await PasswordResetToken.create(
        {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
        { transaction }
      );

      // Send email with the plain token
      const emailResult = await sendPasswordResetEmail(user.email, token);

      if (!emailResult.success) {
        await transaction.rollback();
        console.error('Failed to send password reset email:', emailResult.error);
        return res.status(500).json({
          success: false,
          message: 'Failed to send password reset email',
        });
      }

      await transaction.commit();

      console.log(`Password reset email sent to ${user.email}`);
      return res.status(200).json({
        success: true,
        message: 'If this email exists, we have sent a reset link.',
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error in forgotPassword:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while processing your request',
    });
  }
};

/**
 * Handle password reset request
 * @route POST /auth/reset-password
 */
exports.resetPassword = async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  // Validate input
  if (!token || !password || !confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'Token, password, and confirmPassword are required',
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'Passwords do not match',
    });
  }

  // Password validation
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/;
//   if (!passwordRegex.test(password)) {
//     return res.status(400).json({
//       success: false,
//       message: 'Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, and one number',
//     });
//   }

  const transaction = await PasswordResetToken.sequelize.transaction();

  try {
    // Find unexpired and unused token
    const resetToken = await PasswordResetToken.findOne({
      where: {
        expiresAt: { [Op.gt]: new Date() },
        used: false,
      },
      include: [
        {
          model: User,
          required: true,
        },
      ],
      transaction,
    });

    // If no token found or token doesn't match
    if (!resetToken) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    // Verify token hash
    const isValidToken = await bcrypt.compare(token, resetToken.tokenHash);
    if (!isValidToken) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    // Update user's password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    await User.update(
      { password: hashedPassword },
      { where: { id: resetToken.userId }, transaction }
    );

    // Mark token as used
    await PasswordResetToken.update(
      { used: true },
      { where: { id: resetToken.id }, transaction }
    );

    await transaction.commit();

    console.log(`Password reset successful for user ID: ${resetToken.userId}`);
    return res.status(200).json({
      success: true,
      message: 'Password has been reset successfully',
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error in resetPassword:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while resetting your password',
    });
  }
};
