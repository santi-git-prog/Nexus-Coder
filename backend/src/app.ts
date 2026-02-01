import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import jwt from "jsonwebtoken";
import { authMiddleware } from "./middleware/auth.middleware";
import problemsRoutes from "./routes/problems.routes";
import submissionsRoutes from "./routes/submissions.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/problems", problemsRoutes);
app.use("/api/submissions", submissionsRoutes);
app.get("/", (_req, res) => {
  res.send("Coding Platform Backend Running 🚀");
});
// 🔐 Generate test token
app.get("/api/test-token", (_req, res) => {
  const token = jwt.sign(
    { userId: "test-user-123" },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" }
  );

  res.json({ token });
});

// 🔒 Verify token using middleware
app.get("/api/test-protected", authMiddleware, (req, res) => {
  res.json({
    message: "JWT is working perfectly ✅",
    userId: (req as any).userId,
  });
});


export default app;
