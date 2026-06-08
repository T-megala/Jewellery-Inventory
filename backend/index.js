import app from "./src/app.js";
import pool from "./src/config/database.js";

app.get("/", (req, res) => {
  res.send("Hello World");
});

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
