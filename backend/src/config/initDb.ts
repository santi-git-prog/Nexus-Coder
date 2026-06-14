import { pool } from "./db";

export async function initDb() {
  try {
    console.log("Initializing database tables...");
    
    // Ensure users table has OTP verification columns
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS otp VARCHAR(6);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expiry TIMESTAMP WITH TIME ZONE;
    `);
    
    // If there are any users who have is_verified as NULL, set them to TRUE (existing users)
    await pool.query(`
      UPDATE users SET is_verified = TRUE WHERE is_verified IS NULL;
    `);

    // Create ai_hints table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_hints (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        problem_id UUID REFERENCES problems(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        response TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    console.log("Database checked/initialized successfully ✅");
  } catch (err) {
    console.error("Failed to initialize database:", err);
  }
}

