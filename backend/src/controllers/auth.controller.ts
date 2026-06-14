import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../config/db";
import { sendOtpEmail } from "../utils/mailer";

export const register = async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    // check if user exists
    const userResult = await pool.query(
      "SELECT id, is_verified FROM users WHERE email=$1",
      [email]
    );

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    const hashedPassword = await bcrypt.hash(password, 10);

    if (userResult.rows.length > 0) {
      const existingUser = userResult.rows[0];
      if (existingUser.is_verified) {
        return res.status(409).json({ message: "User already exists" });
      }

      // If user exists but is not verified, update details and generate new OTP
      await pool.query(
        "UPDATE users SET username=$1, password=$2, otp=$3, otp_expiry=$4 WHERE email=$5",
        [username, hashedPassword, otp, otpExpiry, email]
      );

      // Send signup OTP
      await sendOtpEmail(email, otp, "signup");

      return res.status(200).json({
        message: "Verification code sent to your email. Please verify.",
        email,
      });
    }

    // Create user as unverified
    const result = await pool.query(
      "INSERT INTO users (username, email, password, is_verified, otp, otp_expiry) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email",
      [username, email, hashedPassword, false, otp, otpExpiry]
    );

    // Send signup OTP
    await sendOtpEmail(email, otp, "signup");

    return res.status(201).json({
      message: "Registration successful. Please verify the verification code sent to your email.",
      user: result.rows[0],
      email,
    });
  } catch (err) {
    console.error("Error during registration:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check if email is verified
    if (!user.is_verified) {
      // Generate a new OTP and send it
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);

      await pool.query(
        "UPDATE users SET otp=$1, otp_expiry=$2 WHERE email=$3",
        [otp, otpExpiry, email]
      );

      try {
        await sendOtpEmail(email, otp, "signup");
      } catch (mailErr) {
        console.error("Failed to resend validation email on login check:", mailErr);
      }

      return res.status(403).json({
        message: "Email not verified. A verification code has been sent to your email.",
        email: user.email,
        requiresVerification: true
      });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET as string,
      { expiresIn: "1d" }
    );

    return res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    console.error("Error during login:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = result.rows[0];

    // Check if OTP matches and is not expired
    if (user.otp !== otp || new Date(user.otp_expiry) < new Date()) {
      return res.status(400).json({ message: "Invalid or expired verification code" });
    }

    // Update user to verified
    await pool.query(
      "UPDATE users SET is_verified=TRUE, otp=NULL, otp_expiry=NULL WHERE id=$1",
      [user.id]
    );

    // Generate token for automatic login
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET as string,
      { expiresIn: "1d" }
    );

    return res.status(200).json({
      message: "Email verified successfully ✅",
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("Error verifying OTP:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const resendOtp = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const result = await pool.query(
      "SELECT id, is_verified FROM users WHERE email=$1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      "UPDATE users SET otp=$1, otp_expiry=$2 WHERE id=$3",
      [otp, otpExpiry, user.id]
    );

    await sendOtpEmail(email, otp, "signup");

    return res.status(200).json({ message: "Verification code sent successfully" });
  } catch (err) {
    console.error("Error resending OTP:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const result = await pool.query(
      "SELECT id FROM users WHERE email=$1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No user found with this email" });
    }

    const user = result.rows[0];
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      "UPDATE users SET otp=$1, otp_expiry=$2 WHERE id=$3",
      [otp, otpExpiry, user.id]
    );

    await sendOtpEmail(email, otp, "forgot_password");

    return res.status(200).json({ message: "Password reset OTP has been sent to your email" });
  } catch (err) {
    console.error("Error in forgotPassword:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = result.rows[0];

    if (user.otp !== otp || new Date(user.otp_expiry) < new Date()) {
      return res.status(400).json({ message: "Invalid or expired OTP code" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      "UPDATE users SET password=$1, is_verified=TRUE, otp=NULL, otp_expiry=NULL WHERE id=$2",
      [hashedPassword, user.id]
    );

    return res.status(200).json({ message: "Password reset successfully. You can now login." });
  } catch (err) {
    console.error("Error in resetPassword:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
