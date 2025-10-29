/**
 * Converts a date to Indian Standard Time (IST)
 * @param {Date|string} date - Date to convert
 * @returns {Date} Date in IST timezone
 */
const toIST = (date) => {
  if (!date) return null;
  const d = new Date(date);
  return new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
};

/**
 * Formats a date to ISO string in IST
 * @param {Date|string} date - Date to format
 * @returns {string} ISO string in IST
 */
const toISTString = (date) => {
  if (!date) return null;
  return toIST(date).toISOString();
};

/**
 * Gets current date in IST
 * @returns {Date} Current date in IST
 */
const nowIST = () => {
  return toIST(new Date());
};

/**
 * Calculates the duration between two dates in a human-readable format
 * @param {Date} startTime - Start date object
 * @param {Date} endTime - End date object
 * @returns {string} Formatted duration string (e.g., "6 hours 30 minutes")
 */
const calculateDuration = (startTime, endTime) => {
  if (!(startTime instanceof Date) || !(endTime instanceof Date)) {
    throw new Error('Invalid date objects provided');
  }

  const diffInMs = Math.abs(endTime - startTime);
  const hours = Math.floor(diffInMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffInMs % (1000 * 60 * 60)) / (1000 * 60));

  const parts = [];
  if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
  if (minutes > 0 || hours === 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
  
  return parts.join(' ');
};

/**
 * Converts a date to a MySQL compatible datetime string in IST
 * @param {Date|string} date - Date to convert
 * @returns {string} MySQL datetime string in IST
 */
const toMySQLDateTime = (date) => {
  if (!date) return null;
  const d = toIST(date);
  return d.toISOString().slice(0, 19).replace('T', ' ');
};

module.exports = {
  calculateDuration,
  toIST,
  toISTString,
  nowIST,
  toMySQLDateTime
};
