import { pool } from "./db";

export async function initDb() {
  try {
    console.log("Initializing database tables...");
    
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
    
    console.log("ai_hints table checked/created successfully.");
  } catch (err) {
    console.error("Failed to initialize database:", err);
  }
}
