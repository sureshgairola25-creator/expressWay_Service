const axios = require('axios');

const sendSMS = async (to, data) => {
  try {
    const payload = new URLSearchParams();
  //   payload.append('apikey', process.env.SMSALERT_API_KEY);
  //   payload.append('structureid', process.env.SMSALERT_STRUCTURE_ID);
  //   payload.append('sender', process.env.SMSALERT_SENDER);
  //   payload.append('mobileno', to);
  //   payload.append('data', JSON.stringify(data));
  //  console.log(payload);
   
    const url = 'https://www.smsalert.co.in/api/structuredpush.json';

    const response = await axios.post(url, { "apikey": process.env.SMSALERT_API_KEY, "structureid": process.env.SMSALERT_STRUCTURE_ID, "sender": process.env.SMSALERT_SENDER, "mobileno": to, "data": { "otp": data.otp } }, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    console.log('✅ SMS sent successfully:', response.data);
    return { success: true, response: response.data };
  } catch (error) {
    console.error('❌ Error sending SMS:', error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
};

module.exports = { sendSMS };
