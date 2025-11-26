# Password Reset Functionality

This document outlines the implementation details and setup instructions for the password reset functionality in the ExpressWay backend.

## Overview

The password reset flow consists of two main endpoints:
1. `POST /api/v1/auth/forgot-password` - Request a password reset email
2. `POST /api/v1/auth/reset-password` - Reset password using a valid token

## Environment Variables

Add the following environment variables to your `.env` file:

```env
# Email Configuration
EMAIL_FROM=your-email@example.com
SENDGRID_API_KEY=your_sendgrid_api_key
FRONTEND_URL=https://your-frontend-url.com

# Token Configuration
RESET_TOKEN_EXPIRY_MINUTES=30
JWT_SECRET=your_jwt_secret

# Rate Limiting (optional)
RATE_LIMIT_FORGOT=5
RATE_LIMIT_RESET=5
```

## API Endpoints

### 1. Forgot Password

**Endpoint**: `POST /api/v1/auth/forgot-password`

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

**Response**:
- Success (200):
  ```json
  {
    "success": true,
    "message": "If this email exists, we have sent a reset link."
  }
  ```

### 2. Reset Password

**Endpoint**: `POST /api/v1/auth/reset-password`

**Request Body**:
```json
{
  "token": "reset_token_from_email",
  "password": "NewSecurePassword123",
  "confirmPassword": "NewSecurePassword123"
}
```

**Password Requirements**:
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number

**Response**:
- Success (200):
  ```json
  {
    "success": true,
    "message": "Password has been reset successfully"
  }
  ```
- Error (400):
  ```json
  {
    "success": false,
    "message": "Invalid or expired token"
  }
  ```

## Security Features

1. **Rate Limiting**:
   - Forgot Password: 5 requests per hour per IP/email
   - Reset Password: 5 attempts per 15 minutes per IP/token

2. **Token Security**:
   - Tokens are hashed before being stored in the database
   - Tokens expire after 30 minutes (configurable)
   - Tokens are single-use only
   - Previous tokens are invalidated when a new one is requested

3. **Email Privacy**:
   - The API never reveals if an email exists in the system
   - All responses are generic to prevent email enumeration

## Testing

### Unit Tests

Run the test suite with:
```bash
npm test
```

### Manual Testing

1. **Happy Path**:
   ```bash
   # Request password reset
   curl -X POST http://localhost:3000/api/v1/auth/forgot-password \
     -H "Content-Type: application/json" \
     -d '{"email": "user@example.com"}'
   
   # Check email for reset link and use the token
   curl -X POST http://localhost:3000/api/v1/auth/reset-password \
     -H "Content-Type: application/json" \
     -d '{"token": "token_from_email", "password": "NewPass123", "confirmPassword": "NewPass123"}'
   ```

2. **Error Cases**:
   - Try resetting with an invalid token
   - Try using an expired token
   - Try resetting with mismatched passwords
   - Try resetting with a weak password
   - Test rate limiting by making multiple requests

## Database Schema

The `PasswordResetTokens` table has the following structure:

```sql
CREATE TABLE `PasswordResetTokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `tokenHash` varchar(255) NOT NULL,
  `expiresAt` datetime NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_password_reset_tokens_token_hash` (`tokenHash`),
  KEY `idx_password_reset_tokens_user_id` (`userId`),
  CONSTRAINT `PasswordResetTokens_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

## Troubleshooting

1. **Emails not sending**:
   - Verify SendGrid API key is correct
   - Check email sending limits
   - Verify sender email is verified in SendGrid

2. **Token not working**:
   - Check token expiration time
   - Verify token hasn't been used before
   - Ensure database timezone is set to UTC

3. **Rate limiting issues**:
   - Check rate limit headers in response
   - Verify Redis is running if using distributed rate limiting
