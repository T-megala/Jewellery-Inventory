import pool from '../src/config/database.js';

const batchId = process.argv[2] ? Number(process.argv[2]) : null;

const connection = await pool.getConnection();

try {
  await connection.beginTransaction();

  if (batchId) {
    await connection.query(`CREATE TEMPORARY TABLE product_keep_ids (id BIGINT PRIMARY KEY)`);
    await connection.query(
      `INSERT INTO product_keep_ids (id)
       SELECT MAX(id)
       FROM products
       WHERE batch_id = ?
         AND tag_packet_no IS NOT NULL
         AND TRIM(tag_packet_no) != ''
       GROUP BY TRIM(tag_packet_no)`,
      [batchId],
    );

    const [result] = await connection.query(
      `DELETE FROM products
       WHERE batch_id = ?
         AND tag_packet_no IS NOT NULL
         AND TRIM(tag_packet_no) != ''
         AND id NOT IN (SELECT id FROM product_keep_ids)`,
      [batchId],
    );

    await connection.query(`DROP TEMPORARY TABLE product_keep_ids`);
    await connection.commit();

    console.log(`Batch ${batchId}: deleted ${result.affectedRows} duplicate rows`);
  } else {
    const [result] = await connection.query(`
      DELETE FROM products
      WHERE id NOT IN (
        SELECT keep_id FROM (
          SELECT MAX(id) AS keep_id
          FROM products
          WHERE tag_packet_no IS NOT NULL
            AND TRIM(tag_packet_no) != ''
          GROUP BY batch_id, TRIM(tag_packet_no)
        ) deduped
      )
        AND tag_packet_no IS NOT NULL
        AND TRIM(tag_packet_no) != ''
    `);

    await connection.commit();
    console.log(`All batches: deleted ${result.affectedRows} duplicate rows`);
  }

  const targetBatch = batchId ?? 6;
  const [[counts]] = await connection.query(
    `SELECT COUNT(*) AS totalRows, COUNT(DISTINCT TRIM(tag_packet_no)) AS distinctTags
     FROM products WHERE batch_id = ?`,
    [targetBatch],
  );

  console.log(`Batch ${targetBatch} after dedupe:`, counts);
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await pool.end();
}
