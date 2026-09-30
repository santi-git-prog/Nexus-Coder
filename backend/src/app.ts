import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import problemsRoutes from "./routes/problems.routes";
import aiRoutes from "./routes/ai.routes";
const app = express();

const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  throw new Error("FRONTEND_URL must contain the deployed frontend origin in production.");
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || process.env.NODE_ENV !== "production" || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin is not allowed by CORS"));
  },
}));
app.use(express.json({ limit: "256kb" }));

app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", problemsRoutes);
app.use("/api", aiRoutes);

app.get("/", (_req, res) => {
  res.send("Coding Platform Backend Running 🚀");
});
export default app;
