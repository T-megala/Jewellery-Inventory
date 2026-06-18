import express from "express";
import pool from "./src/config/database.js";
import productRoutes from "./src/routes/productRoutes.js";
import stockVerificationRoutes from "./src/routes/stockVerificationRoutes.js";
import stockVerificationReportRoutes from "./src/routes/stockVerificationReportRoutes.js";
import dropdownRoutes from "./src/routes/dropdownRoutes.js";
import productBatchRoutes from "./src/routes/productBatchRoutes.js";
import dashboardRoutes from "./src/routes/dashboardRoutes.js";
import authRoutes from "./src/routes/authRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import branchRoutes from "./src/routes/branchRoutes.js";
import roleRoutes from "./src/routes/roleRoutes.js";
import { authenticateApi } from "./src/middleware/authMiddleware.js";
import { resolveBranchScope } from "./src/middleware/accessMiddleware.js";
import { errorHandler } from "./src/middleware/errorHandler.js";
import androidReportsRoutes from "./src/routes/androidReportsRoutes.js";

const app = express();

app.use(express.json());

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : [];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.length === 0) {
    res.header("Access-Control-Allow-Origin", "*");
  } else if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.get("/", (req, res) => {
  res.send("Hello World");
});

app.use("/api/v1", authRoutes);
app.use("/api/v1", productRoutes);
app.use("/api/v1", stockVerificationRoutes);
app.use("/api/v1", androidReportsRoutes);
app.use("/api/v1", authenticateApi);
app.use("/api/v1", resolveBranchScope);
app.use("/api/v1", branchRoutes);
app.use("/api/v1", roleRoutes);
app.use("/api/v1", stockVerificationReportRoutes);
app.use("/api/v1", dropdownRoutes);
app.use("/api/v1", productBatchRoutes);
app.use("/api/v1", dashboardRoutes);
app.use("/api/v1", userRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 5004;

const startServer = async () => {
  try {
    const connection = await pool.getConnection();

    const [rows] = await connection.query("SELECT DATABASE() AS dbName");
    const dbName = rows[0]?.dbName;

    if (!dbName) {
      throw new Error(
        "Database connection succeeded but no database is selected. Check DB_NAME in .env",
      );
    }

    console.log(`Database connected: ${dbName}`);
    connection.release();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
};

startServer();
