import { fileURLToPath } from "node:url";
import pool from "../config/database.js";

const columnExists = async (connection, tableName, columnName) => {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );

  return Number(rows[0].count) > 0;
};

const runMigration = async () => {
  const connection = await pool.getConnection();

  try {
    console.log("running database migration...");

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS product_upload_batches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        batch_date DATE NOT NULL,
        uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        uploaded_by VARCHAR(100) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        INDEX idx_batch_date (batch_date),
        INDEX idx_is_active (is_active)
      )
    `);
    console.log("ok: product_upload_batches");

    if (!(await columnExists(connection, "products", "batch_id"))) {
      await connection.execute(`
        ALTER TABLE products
        ADD COLUMN batch_id INT NULL
      `);

      await connection.execute(`
        ALTER TABLE products
        ADD CONSTRAINT fk_products_batch
          FOREIGN KEY (batch_id) REFERENCES product_upload_batches(id)
      `);
      console.log("ok: products.batch_id");
    }

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        username   VARCHAR(100) NOT NULL UNIQUE,
        password   VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("ok: users");

    console.log("database migration completed");
  } finally {
    connection.release();
  }
};

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  try {
    await runMigration();
    process.exitCode = 0;
  } catch (error) {
    console.error("migration failed:", error.message);
    if (error.sql) {
      console.error(error.sql);
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

export default runMigration;
