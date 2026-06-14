import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendOtpEmail = async (
  email: string,
  otp: string,
  purpose: "signup" | "forgot_password"
) => {
  const isSignup = purpose === "signup";
  const title = isSignup ? "Verify Your Account" : "Reset Your Password";
  const heading = isSignup ? "Welcome to Nexus Code!" : "Password Reset Request";
  const description = isSignup
    ? "Thank you for registering. Please use the following One-Time Password (OTP) to complete your signup process. This code is valid for 15 minutes."
    : "We received a request to reset your password. Use the following One-Time Password (OTP) to proceed with resetting your password. This code is valid for 15 minutes. If you did not make this request, you can safely ignore this email.";

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #0f172a;
            color: #e2e8f0;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #1e293b;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
            border: 1px solid #334155;
          }
          .header {
            background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
            padding: 30px;
            text-align: center;
          }
          .logo {
            font-size: 28px;
            font-weight: 800;
            color: #ffffff;
            letter-spacing: 1px;
            margin: 0;
            text-shadow: 0 2px 4px rgba(0,0,0,0.2);
          }
          .content {
            padding: 40px 30px;
            line-height: 1.6;
          }
          h1 {
            color: #ffffff;
            font-size: 22px;
            margin-top: 0;
            margin-bottom: 20px;
            font-weight: 700;
          }
          p {
            color: #94a3b8;
            margin-bottom: 30px;
            font-size: 16px;
          }
          .otp-container {
            background-color: #0f172a;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            border: 1px solid #334155;
            margin: 30px 0;
          }
          .otp-code {
            font-family: 'Courier New', Courier, monospace;
            font-size: 36px;
            font-weight: 800;
            color: #38bdf8;
            letter-spacing: 8px;
            margin: 0;
          }
          .footer {
            background-color: #0f172a;
            padding: 20px;
            text-align: center;
            border-top: 1px solid #334155;
            font-size: 12px;
            color: #64748b;
          }
          .footer a {
            color: #6366f1;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">NEXUS CODE</div>
          </div>
          <div class="content">
            <h1>${heading}</h1>
            <p>${description}</p>
            <div class="otp-container">
              <div class="otp-code">${otp}</div>
            </div>
            <p style="font-size: 14px; margin-top: 30px;">
              If you didn't request this code, please ignore this email or contact support.
            </p>
          </div>
          <div class="footer">
            <p style="margin: 0;">&copy; ${new Date().getFullYear()} Nexus Code. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const mailOptions = {
    from: `"Nexus Code Support" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `[Nexus Code] ${title}`,
    html: htmlContent,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${email}. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};
