const nodemailer = require('nodemailer');
require('dotenv').config(); // if using .env for SMTP credentials

async function sendTestEmail() {
  try {
    // create transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
      auth: {
        user: process.env.SMTP_USER, // your email
        pass: process.env.SMTP_PASS  // app password or real password
      }
    });

    // verify SMTP connection
    await transporter.verify();
    console.log('SMTP connection successful!');

    // send test email
    const info = await transporter.sendMail({
      from: `"Test SMTP" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER, // send to yourself to check
      subject: 'SMTP Test Email',
      text: 'Hello! This is a test email to check SMTP setup.'
    });

    console.log('Email sent successfully!');
    console.log('Message ID:', info.messageId);
    if (nodemailer.getTestMessageUrl(info)) {
      console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
    }

  } catch (err) {
    console.error('Failed to send email:', err.message);
  }
}

sendTestEmail();
