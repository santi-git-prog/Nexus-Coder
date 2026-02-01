import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { pool } from "./config/db";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
