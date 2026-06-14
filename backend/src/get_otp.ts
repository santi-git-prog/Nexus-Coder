import { pool } from "./config/db";
import dotenv from "dotenv";
dotenv.config();

async function getOtp() {
  try {
    const res = await pool.query("SELECT otp, otp_expiry, is_verified FROM users WHERE email='sunshine.sankum@gmail.com'");
    console.log("OTP DETAILS:", res.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
getOtp();
