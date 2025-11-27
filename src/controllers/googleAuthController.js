const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const User = require('../db/models/User');

// Google OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Generate Google OAuth URL
exports.getGoogleAuthURL = (req, res) => {
  try {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
    });

    return res.status(200).json({
      success: true,
      url,
    });
  } catch (error) {
    console.error('Error generating Google auth URL:', error);
    return res.status(500).json({
      success: false,
      message: 'Error generating Google auth URL',
      error: error.message,
    });
  }
};

// Handle Google OAuth callback
exports.googleCallback = async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Authorization code is required',
      });
    }

    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();

    if (!data.email) {
      return res.status(400).json({
        success: false,
        message: 'Could not get email from Google',
      });
    }

    // Find or create user
    let user = await User.findOne({
      where: {
        [Op.or]: [
          { email: data.email },
          { googleId: data.id }
        ]
      }
    });

    const userData = {
      firstName: data.given_name || data.name.split(' ')[0],
      lastName: data.family_name || data.name.split(' ').slice(1).join(' ') || '',
      email: data.email,
      googleId: data.id,
      provider: 'google',
      isVerified: true,
      role: 'user',
      profilePicture: data.picture || null,
    };

    if (!user) {
      // Create new user
      user = await User.create(userData);
    } else {
      // Update existing user
      await user.update(userData);
      user = await user.reload();
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '30d' }
    );

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    // Redirect to frontend with token in URL (for clients that can't access cookies)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/auth/google/callback?token=${token}`);

  } catch (error) {
    console.error('Google OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
  }
};

// Get current user
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting current user',
      error: error.message,
    });
  }
};

// Logout user
exports.logout = (req, res) => {
  res.clearCookie('token');
  return res.status(200).json({
    success: true,
    message: 'Successfully logged out',
  });
};
