import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { pool } from "./config/db";
import { initDb } from "./config/initDb";

const PORT = process.env.PORT || 5000;

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error("Database initialization failed", err);
  process.exit(1);
});

