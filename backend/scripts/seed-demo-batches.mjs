import pool from "../src/config/database.js";

const PRODUCT_COLUMNS = `
  tran_no, tran_date, product, sub_product, tag_packet_no,
  pieces, gross_wt, net_wt, counter_name, size, tag_type,
  item_pieces, weight_gram, weight_carat
`;

const copyBatchWithReduction = async (connection, sourceBatchId, targetBatchId, reducePerProduct) => {
  const [result] = await connection.query(
    `INSERT INTO products (batch_id, ${PRODUCT_COLUMNS})
     SELECT
       ?,
       p.tran_no, p.tran_date, p.product, p.sub_product, p.tag_packet_no,
       p.pieces, p.gross_wt, p.net_wt, p.counter_name, p.size, p.tag_type,
       p.item_pieces, p.weight_gram, p.weight_carat
     FROM products p
     INNER JOIN (
       SELECT
         id,
         ROW_NUMBER() OVER (PARTITION BY product ORDER BY id) AS rn,
         COUNT(*) OVER (PARTITION BY product) AS product_count
       FROM products
       WHERE batch_id = ?
         AND tag_packet_no IS NOT NULL
         AND TRIM(tag_packet_no) != ''
         AND product IS NOT NULL
         AND TRIM(product) != ''
     ) ranked ON p.id = ranked.id
     WHERE ranked.rn <= GREATEST(ranked.product_count - ?, 0)`,
    [targetBatchId, sourceBatchId, reducePerProduct],
  );

  return result.affectedRows;
};

const createBatch = async (connection, uploadedBy) => {
  const [insertResult] = await connection.execute(
    `INSERT INTO product_upload_batches (batch_date, uploaded_at, uploaded_by, is_active)
     VALUES (CURDATE(), NOW(), ?, 0)`,
    [uploadedBy],
  );

  return insertResult.insertId;
};

const connection = await pool.getConnection();

try {
  await connection.beginTransaction();

  const [existingBatches] = await connection.execute(
    `SELECT id FROM product_upload_batches ORDER BY id DESC`,
  );

  if (existingBatches.length === 0) {
    throw new Error("No existing batch found. Import stock Excel first.");
  }

  const sourceBatchId = existingBatches[0].id;
  console.log(`Source batch: ${sourceBatchId}`);

  const batch2Id = await createBatch(connection, "seed-demo-batch-2");
  const batch2Rows = await copyBatchWithReduction(
    connection,
    sourceBatchId,
    batch2Id,
    2,
  );
  console.log(`Created batch ${batch2Id} with ${batch2Rows} products (-2 tags per product)`);

  const batch3Id = await createBatch(connection, "seed-demo-batch-3");
  const batch3Rows = await copyBatchWithReduction(
    connection,
    batch2Id,
    batch3Id,
    1,
  );
  console.log(`Created batch ${batch3Id} with ${batch3Rows} products (-1 tag per product)`);

  await connection.execute(
    `UPDATE product_upload_batches SET is_active = 0`,
  );
  await connection.execute(
    `UPDATE product_upload_batches SET is_active = 1 WHERE id = ?`,
    [batch3Id],
  );

  await connection.commit();

  const [summary] = await pool.execute(
    `SELECT b.id, b.batch_date, b.is_active, COUNT(p.id) AS product_count
     FROM product_upload_batches b
     LEFT JOIN products p ON p.batch_id = b.id
     GROUP BY b.id, b.batch_date, b.is_active
     ORDER BY b.id`,
  );

  console.log("Batches in database:");
  console.table(summary);

  const [topSold] = await pool.execute(
    `SELECT
       old_data.product AS productName,
       old_data.total_count AS yesterdayCount,
       COALESCE(new_data.total_count, 0) AS todayCount,
       CASE
         WHEN old_data.total_count > COALESCE(new_data.total_count, 0)
         THEN old_data.total_count - COALESCE(new_data.total_count, 0)
         ELSE 0
       END AS soldCount
     FROM (
       SELECT product, COUNT(*) AS total_count
       FROM products
       WHERE batch_id = ?
         AND tag_packet_no IS NOT NULL AND TRIM(tag_packet_no) != ''
         AND product IS NOT NULL AND TRIM(product) != ''
       GROUP BY product
     ) old_data
     LEFT JOIN (
       SELECT product, COUNT(*) AS total_count
       FROM products
       WHERE batch_id = ?
         AND tag_packet_no IS NOT NULL AND TRIM(tag_packet_no) != ''
         AND product IS NOT NULL AND TRIM(product) != ''
       GROUP BY product
     ) new_data ON old_data.product = new_data.product
     HAVING soldCount > 0
     ORDER BY soldCount DESC
     LIMIT 5`,
    [batch2Id, batch3Id],
  );

  console.log("Sample top sold (batch 2 vs batch 3):");
  console.table(topSold);
} catch (error) {
  await connection.rollback();
  console.error("Seed failed:", error.message);
  process.exitCode = 1;
} finally {
  connection.release();
  await pool.end();
}
