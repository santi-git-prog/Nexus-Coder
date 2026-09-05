import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production" || process.env.DATABASE_URL?.includes("supabase");

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

pool.on("connect", () => {
  console.log("PostgreSQL connected successfully ✅");
});
