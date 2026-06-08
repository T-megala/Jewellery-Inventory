import express from "express";
import pool from "./src/config/database.js";
import productRoutes from "./src/routes/productRoutes.js";
import stockVerificationRoutes from "./src/routes/stockVerificationRoutes.js";
import stockVerificationReportRoutes from "./src/routes/stockVerificationReportRoutes.js";
import dropdownRoutes from "./src/routes/dropdownRoutes.js";
import { errorHandler } from "./src/middleware/errorHandler.js";

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World");
});

app.use("/api/v1", productRoutes);
app.use("/api/v1", stockVerificationRoutes);
app.use("/api/v1", stockVerificationReportRoutes);
app.use("/api/v1", dropdownRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 5004;

const startServer = async () => {
  try {
    const connection = await pool.getConnection();

    const [rows] = await connection.query("SELECT DATABASE() AS dbName");
    const dbName = rows[0]?.dbName;

    if (!dbName) {
      throw new Error(
        "Database connection succeeded but no database is selected. Check DB_NAME in .env"
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
