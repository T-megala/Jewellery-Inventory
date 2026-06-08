import app from "./src/app.js";
import pool from "./src/config/database.js";

app.get("/", (req, res) => {
  res.send("Hello World");
});

const PORT = process.env.PORT || 5004;

const startServer = async () => {
  try {
    const connection = await pool.getConnection();
    console.log(`Database connected: ${process.env.DB_NAME}`);
    connection.release();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
};

startServer();
