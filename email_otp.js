import nodemailer from "nodemailer";

async function sendOTP() {
  // Create a test account
  let testAccount = await nodemailer.createTestAccount();

  // Create transporter
  let transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  // Generate OTP
  const otp = Math.floor(100000 + Math.random() * 900000);

  // Send mail
  let info = await transporter.sendMail({
    from: '"OTP Test" <kleena1403@gmail.com>',
    to: "kleena1403@gmail.com",  // replace with your email
    subject: "Your OTP Code",
    text: `Your OTP is: ${otp}`,
  });

  console.log(`OTP sent: ${otp}`);
  console.log("Preview URL (view the email in browser):", nodemailer.getTestMessageUrl(info));
}

sendOTP().catch(console.error);
