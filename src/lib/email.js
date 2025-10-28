const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendEmail = async (to, subject, text) => {
  try {
    // Check if SendGrid API key is configured
    if (!process.env.SENDGRID_API_KEY) {
      console.error('SendGrid API key not configured in environment variables');
      return { success: false, error: 'SendGrid API key not configured' };
    }

    const msg = {
      to,
      from: process.env.SENDGRID_FROM_EMAIL, // This should be a verified sender in SendGrid
      subject,
      text,
    };
    console.log(msg, 'msg sent');
    

    const result = await sgMail.send(msg);
    console.log('Email sent successfully:', result);
    return { success: true, messageId: result[0].headers['x-message-id'] };
  } catch (error) {
    console.error('Error sending email:', error.response?.body?.errors || error.message);
    return { success: false, error: error.response?.body?.errors || error.message };
  }
};

module.exports = { sendEmail };
