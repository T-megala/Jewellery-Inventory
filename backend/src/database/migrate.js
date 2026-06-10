import pool from "../config/database.js";

const runMigration = async () => {
  const connection = await pool.getConnection();

  try {
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

    const [batchIdColumn] = await connection.execute(
      `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'products'
         AND COLUMN_NAME = 'batch_id'`,
    );

    if (Number(batchIdColumn[0].count) === 0) {
      await connection.execute(`
        ALTER TABLE products
        ADD COLUMN batch_id INT NULL
      `);

      await connection.execute(`
        ALTER TABLE products
        ADD CONSTRAINT fk_products_batch
          FOREIGN KEY (batch_id) REFERENCES product_upload_batches(id)
      `);
    }

    const [orphanProducts] = await connection.execute(
      `SELECT COUNT(*) AS count FROM products WHERE batch_id IS NULL`,
    );

    if (Number(orphanProducts[0].count) > 0) {
      const [legacyBatch] = await connection.execute(
        `SELECT id FROM product_upload_batches WHERE uploaded_by = 'legacy-migration' LIMIT 1`,
      );

      let legacyBatchId;

      if (legacyBatch.length > 0) {
        legacyBatchId = legacyBatch[0].id;
      } else {
        await connection.execute(
          `UPDATE product_upload_batches SET is_active = 0 WHERE is_active = 1`,
        );

        const [insertResult] = await connection.execute(
          `INSERT INTO product_upload_batches (batch_date, uploaded_at, uploaded_by, is_active)
           VALUES (CURDATE(), NOW(), 'legacy-migration', 1)`,
        );
        legacyBatchId = insertResult.insertId;
      }

      await connection.execute(
        `UPDATE products p
         INNER JOIN (
           SELECT tag_packet_no, MAX(id) AS keep_id
           FROM products
           WHERE batch_id IS NULL
           GROUP BY tag_packet_no
         ) latest ON p.id = latest.keep_id
         SET p.batch_id = ?`,
        [legacyBatchId],
      );
    }

    const [batchTagIndex] = await connection.execute(
      `SELECT COUNT(*) AS count
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'products'
         AND INDEX_NAME = 'uk_batch_tag'`,
    );

    if (Number(batchTagIndex[0].count) === 0) {
      await connection.execute(`
        CREATE UNIQUE INDEX uk_batch_tag ON products (batch_id, tag_packet_no)
      `);
    }

    const [tagIndex] = await connection.execute(
      `SELECT COUNT(*) AS count
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'products'
         AND INDEX_NAME = 'idx_tag_packet_no'`,
    );

    if (Number(tagIndex[0].count) === 0) {
      await connection.execute(`
        CREATE INDEX idx_tag_packet_no ON products (tag_packet_no)
      `);
    }

    // 002 – users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        username   VARCHAR(100) NOT NULL UNIQUE,
        password   VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 003 – backfill verification dates
    const [backfillResult] = await connection.execute(
      `UPDATE stock_verification
       SET verification_date = created_at
       WHERE ABS(DATEDIFF(DATE(verification_date), DATE(created_at))) > 7
          OR YEAR(verification_date) <> YEAR(created_at)`,
    );
    console.log(
      "backfilled stock_verification rows:",
      backfillResult.affectedRows,
    );

    console.log("Database migration completed");
  } finally {
    connection.release();
  }
};

export default runMigration;
