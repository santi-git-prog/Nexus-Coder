import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { initDb } from "./config/initDb";

const PORT = process.env.PORT || 5000;

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be configured before starting the server");
}

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error("Database initialization failed", err);
  process.exit(1);
});

