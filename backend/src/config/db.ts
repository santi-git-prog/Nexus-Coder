import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

let connectionString = process.env.DATABASE_URL || "";

// Fix unescaped @ in password if present (e.g. Santi123!@$@host -> Santi123!%40$@host)
if (connectionString.includes("!@$@")) {
  connectionString = connectionString.replace("!@$@", "!%40$@");
}

const isProduction = process.env.NODE_ENV === "production" || connectionString.includes("supabase");

export const pool = new Pool({
  connectionString,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

pool.on("connect", () => {
  console.log("PostgreSQL connected successfully ✅");
});

pool.on("error", (err: any) => {
  if (err?.code === "ENETUNREACH") {
    console.error("❌ DB Network Unreachable: Render free tier requires Supabase IPv4 Pooler host instead of direct IPv6 host.");
  } else {
    console.error("PostgreSQL pool error:", err);
  }
});
