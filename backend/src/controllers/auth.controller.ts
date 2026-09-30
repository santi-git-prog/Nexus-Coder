import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { pool } from "../config/db";
import { sendOtpEmail } from "../utils/mailer";

type OtpPurpose = "signup" | "forgot_password";

class OtpRateLimitError extends Error {}

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const otpHash = (email: string, otp: string): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return createHmac("sha256", secret).update(`${email}:${otp}`).digest("hex");
};

const createOtp = (): string => randomInt(0, 1_000_000).toString().padStart(6, "0");

const signToken = (userId: string) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return jwt.sign({ userId }, secret, { expiresIn: "1d" });
};

const issueOtp = async (userId: string, email: string, purpose: OtpPurpose) => {
  const otp = createOtp();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const issued = await pool.query(
    `UPDATE users
       SET otp = NULL, otp_hash = $1, otp_purpose = $2,
           otp_expiry = $3, otp_attempts = 0, otp_sent_at = NOW()
     WHERE id = $4
       AND (otp_sent_at IS NULL OR otp_sent_at < NOW() - INTERVAL '60 seconds')
     RETURNING id`,
    [otpHash(email, otp), purpose, expiresAt, userId]
  );
  if (issued.rowCount !== 1) throw new OtpRateLimitError();

  try {
    await sendOtpEmail(email, otp, purpose);
  } catch (error) {
    await pool.query(
      `UPDATE users
         SET otp_hash = NULL, otp_purpose = NULL, otp_expiry = NULL,
             otp_attempts = 0, otp_sent_at = NULL
       WHERE id = $1 AND otp_hash = $2`,
      [userId, otpHash(email, otp)]
    );
    throw error;
  }
};

const verifyAndConsumeOtp = async (
  email: string,
  user: Record<string, any>,
  otp: string,
  purpose: OtpPurpose
): Promise<boolean> => {
  const validFormat = /^\d{6}$/.test(otp);
  const storedHash = user.otp_hash as string | null;
  const legacyMatch = !storedHash && purpose === "signup" && user.otp === otp;
  const suppliedHash = otpHash(email, otp);
  const hashMatch = Boolean(
    storedHash &&
      storedHash.length === suppliedHash.length &&
      timingSafeEqual(Buffer.from(storedHash), Buffer.from(suppliedHash))
  );
  const purposeMatches = user.otp_purpose === purpose || (!user.otp_purpose && legacyMatch);
  const expiresAt = user.otp_expiry ? new Date(user.otp_expiry).getTime() : 0;

  if (
    !validFormat ||
    !purposeMatches ||
    (!hashMatch && !legacyMatch) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now() ||
    Number(user.otp_attempts || 0) >= 5
  ) {
    await pool.query(
      `UPDATE users SET otp_attempts = COALESCE(otp_attempts, 0) + 1
       WHERE id = $1 AND otp_expiry > NOW() AND COALESCE(otp_attempts, 0) < 5`,
      [user.id]
    );
    return false;
  }

  const consumed = await pool.query(
    `UPDATE users
       SET is_verified = CASE WHEN $2 = 'signup' THEN TRUE ELSE is_verified END,
           otp = NULL, otp_hash = NULL, otp_purpose = NULL,
           otp_expiry = NULL, otp_attempts = 0
     WHERE id = $1 AND otp_expiry > NOW()
       AND (otp_hash = $3 OR ($2 = 'signup' AND otp = $4))
       AND (otp_purpose = $2 OR otp_purpose IS NULL)
       AND COALESCE(otp_attempts, 0) < 5
     RETURNING id`,
    [user.id, purpose, storedHash || suppliedHash, otp]
  );
  return consumed.rowCount === 1;
};

const emailIsValid = (email: string) =>
  email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const mailFailure = (res: Response) =>
  res.status(503).json({ message: "We could not send the verification email. Please try again shortly." });

const otpFailure = (res: Response, error: unknown) => {
  if (error instanceof OtpRateLimitError) {
    return res.status(429).json({ message: "Please wait 60 seconds before requesting another code." });
  }
  return mailFailure(res);
};

export const register = async (req: Request, res: Response) => {
  try {
    const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (!username || !email || !password) {
      return res.status(400).json({ message: "Username, email, and password are required" });
    }
    if (username.length > 40 || password.length < 8 || password.length > 128 || !emailIsValid(email)) {
      return res.status(400).json({ message: "Enter a valid email, a username up to 40 characters, and a password between 8 and 128 characters" });
    }

    const existing = await pool.query(
      "SELECT id, is_verified, otp_sent_at FROM users WHERE LOWER(email) = $1",
      [email]
    );
    if (existing.rows[0]?.is_verified) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }
    const lastOtpSentAt = existing.rows[0]?.otp_sent_at
      ? new Date(existing.rows[0].otp_sent_at).getTime()
      : 0;
    if (lastOtpSentAt && Date.now() - lastOtpSentAt < 60_000) {
      return res.status(429).json({ message: "A verification code was sent recently. Check your inbox or try again in 60 seconds." });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    let userId: string;
    let status = 201;

    if (existing.rows[0]) {
      userId = existing.rows[0].id;
      status = 200;
      await pool.query(
        `UPDATE users SET username = $1, email = $2, password = $3,
           is_verified = FALSE, otp = NULL, otp_hash = NULL,
           otp_purpose = NULL, otp_expiry = NULL, otp_attempts = 0
         WHERE id = $4`,
        [username, email, hashedPassword, userId]
      );
    } else {
      const inserted = await pool.query(
        `INSERT INTO users (username, email, password, is_verified, otp, otp_expiry)
         VALUES ($1, $2, $3, FALSE, NULL, NULL) RETURNING id`,
        [username, email, hashedPassword]
      );
      userId = inserted.rows[0].id;
    }

    try {
      await issueOtp(userId, email, "signup");
    } catch (error) {
      if (!(error instanceof OtpRateLimitError)) console.error("Signup verification email failed:", error);
      return otpFailure(res, error);
    }

    return res.status(status).json({
      message: "Verification code sent. Check your inbox and spam folder.",
      email,
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ message: "An account with this email already exists" });
    }
    console.error("Error during registration:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const result = await pool.query("SELECT * FROM users WHERE LOWER(email) = $1", [email]);
    if (result.rows.length === 0 || !(await bcrypt.compare(password, result.rows[0].password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = result.rows[0];
    if (!user.is_verified) {
      try {
        await issueOtp(user.id, email, "signup");
      } catch (mailErr) {
        if (mailErr instanceof OtpRateLimitError) {
          return res.status(403).json({
            message: "Your email is not verified. Use the verification code already sent to your inbox.",
            email,
            requiresVerification: true,
          });
        }
        console.error("Login verification email failed:", mailErr);
        return otpFailure(res, mailErr);
      }
      return res.status(403).json({
        message: "Your email is not verified. A new verification code has been sent.",
        email,
        requiresVerification: true,
      });
    }

    return res.json({
      token: signToken(user.id),
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("Error during login:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = typeof req.body.otp === "string" ? req.body.otp.trim() : "";
    if (!email || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: "Enter your email and the 6-digit verification code" });
    }

    const result = await pool.query("SELECT * FROM users WHERE LOWER(email) = $1", [email]);
    if (!result.rows[0]) return res.status(404).json({ message: "User not found" });
    const user = result.rows[0];
    if (user.is_verified) return res.status(400).json({ message: "Email is already verified. Please sign in." });

    if (!(await verifyAndConsumeOtp(email, user, otp, "signup"))) {
      return res.status(400).json({ message: "Invalid or expired verification code. Request a new code and try again." });
    }

    return res.status(200).json({
      message: "Email verified successfully",
      token: signToken(user.id),
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("Error verifying OTP:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const resendOtp = async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) return res.status(400).json({ message: "Email is required" });

    const result = await pool.query("SELECT id, is_verified FROM users WHERE LOWER(email) = $1", [email]);
    if (!result.rows[0]) return res.status(404).json({ message: "User not found" });
    if (result.rows[0].is_verified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    try {
      await issueOtp(result.rows[0].id, email, "signup");
    } catch (error) {
      if (!(error instanceof OtpRateLimitError)) console.error("Resend verification email failed:", error);
      return otpFailure(res, error);
    }
    return res.status(200).json({ message: "Verification code sent. Check your inbox and spam folder." });
  } catch (err) {
    console.error("Error resending OTP:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email || !emailIsValid(email)) return res.status(400).json({ message: "Enter a valid email address" });

    const result = await pool.query(
      "SELECT id, is_verified FROM users WHERE LOWER(email) = $1",
      [email]
    );
    if (!result.rows[0] || !result.rows[0].is_verified) {
      return res.status(200).json({ message: "If an account exists for this email, a password reset code will be sent." });
    }

    try {
      await issueOtp(result.rows[0].id, email, "forgot_password");
    } catch (error) {
      if (!(error instanceof OtpRateLimitError)) console.error("Password reset email failed:", error);
      return otpFailure(res, error);
    }
    return res.status(200).json({ message: "Password reset code sent. Check your inbox and spam folder." });
  } catch (err) {
    console.error("Error in forgotPassword:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = typeof req.body.otp === "string" ? req.body.otp.trim() : "";
    const newPassword = typeof req.body.newPassword === "string" ? req.body.newPassword : "";
    if (!email || !/^\d{6}$/.test(otp) || !newPassword) {
      return res.status(400).json({ message: "Email, 6-digit code, and new password are required" });
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ message: "Password must be between 8 and 128 characters" });
    }

    const result = await pool.query("SELECT * FROM users WHERE LOWER(email) = $1", [email]);
    if (!result.rows[0]) return res.status(400).json({ message: "Invalid or expired reset code" });
    const user = result.rows[0];
    const hashMatches = Boolean(
      user.otp_hash &&
        user.otp_hash.length === otpHash(email, otp).length &&
        timingSafeEqual(Buffer.from(user.otp_hash), Buffer.from(otpHash(email, otp)))
    );
    const expiry = user.otp_expiry ? new Date(user.otp_expiry).getTime() : 0;

    if (
      user.otp_purpose !== "forgot_password" ||
      !hashMatches ||
      !Number.isFinite(expiry) ||
      expiry <= Date.now() ||
      Number(user.otp_attempts || 0) >= 5
    ) {
      await pool.query(
        `UPDATE users SET otp_attempts = COALESCE(otp_attempts, 0) + 1
         WHERE id = $1 AND otp_expiry > NOW() AND COALESCE(otp_attempts, 0) < 5`,
        [user.id]
      );
      return res.status(400).json({ message: "Invalid or expired reset code" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    const updated = await pool.query(
      `UPDATE users SET password = $1, otp_hash = NULL, otp_purpose = NULL,
          otp_expiry = NULL, otp_attempts = 0
       WHERE id = $2 AND otp_hash = $3 AND otp_purpose = 'forgot_password'
         AND otp_expiry > NOW() AND COALESCE(otp_attempts, 0) < 5
       RETURNING id`,
      [hashedPassword, user.id, user.otp_hash]
    );
    if (updated.rowCount !== 1) return res.status(400).json({ message: "Invalid or expired reset code" });

    return res.status(200).json({ message: "Password reset successfully. You can now sign in." });
  } catch (err) {
    console.error("Error resetting password:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
