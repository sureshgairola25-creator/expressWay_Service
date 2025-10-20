const crypto = require('crypto');

if (!process.env.ENCRYPTION_KEY) {
  throw new Error('ENCRYPTION_KEY is not defined in environment variables');
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const IV_LENGTH = 16; // For AES, this is always 16
const ALGORITHM = 'aes-256-cbc';
const ENCODING = 'hex';
const STRING_ENCODING = 'utf8';

const cryptoUtils = {
  /**
   * Encrypts text using AES-256-CBC with a random IV
   * @param {string} text - The text to encrypt
   * @returns {string} Encrypted string in format 'iv:encryptedText'
   */
  encrypt: (text) => {
    if (typeof text !== 'string') {
      throw new Error('Input must be a string');
    }

    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
      let encrypted = cipher.update(text, STRING_ENCODING, ENCODING);
      encrypted += cipher.final(ENCODING);
      return `${iv.toString(ENCODING)}:${encrypted}`;
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  },

  /**
   * Decrypts text using AES-256-CBC
   * @param {string} text - The text to decrypt in format 'iv:encryptedText'
   * @returns {string} Decrypted string
   */
  decrypt: (text) => {
    if (typeof text !== 'string') {
      throw new Error('Input must be a string');
    }

    try {
      const textParts = text.split(':');
      if (textParts.length < 2) {
        throw new Error('Invalid encrypted text format');
      }
      
      const iv = Buffer.from(textParts.shift(), ENCODING);
      const encryptedText = textParts.join(':');
      const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
      let decrypted = decipher.update(encryptedText, ENCODING, STRING_ENCODING);
      decrypted += decipher.final(STRING_ENCODING);
      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  },

  /**
   * Hashes a password using PBKDF2 with a random salt
   * @param {string} password - The password to hash
   * @returns {string} Hashed password in format 'salt:hash'
   */
  hashPassword: (password) => {
    if (typeof password !== 'string') {
      throw new Error('Password must be a string');
    }

    try {
      const salt = crypto.randomBytes(32).toString(ENCODING);
      const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString(ENCODING);
      return `${salt}:${hash}`;
    } catch (error) {
      throw new Error(`Password hashing failed: ${error.message}`);
    }
  },

  /**
   * Verifies a password against a hash
   * @param {string} password - The password to verify
   * @param {string} storedHash - The stored hash in format 'salt:hash'
   * @returns {boolean} True if password matches, false otherwise
   */
  verifyPassword: (password, storedHash) => {
    if (typeof password !== 'string' || typeof storedHash !== 'string') {
      return false;
    }

    try {
      const [salt, hash] = storedHash.split(':');
      if (!salt || !hash) return false;
      
      const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString(ENCODING);
      return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(verifyHash));
    } catch (error) {
      return false;
    }
  }
};

module.exports = cryptoUtils;
