import pool from '../src/config/database.js';

const batchId = Number(process.argv[2] ?? 6);

const [[counts]] = await pool.query(
  `SELECT COUNT(*) AS totalRows,
          COUNT(DISTINCT tag_packet_no) AS distinctTags
   FROM products WHERE batch_id = ?`,
  [batchId],
);

const [[dupes]] = await pool.query(
  `SELECT COUNT(*) AS duplicateTagGroups
   FROM (
     SELECT tag_packet_no FROM products WHERE batch_id = ?
     GROUP BY tag_packet_no HAVING COUNT(*) > 1
   ) t`,
  [batchId],
);

const [[extra]] = await pool.query(
  `SELECT COALESCE(SUM(cnt - 1), 0) AS extraRows
   FROM (
     SELECT COUNT(*) cnt FROM products WHERE batch_id = ?
     GROUP BY tag_packet_no HAVING COUNT(*) > 1
   ) t`,
  [batchId],
);

const [batches] = await pool.query(
  `SELECT b.id, b.batch_date, b.uploaded_at, b.is_active,
          (SELECT COUNT(*) FROM products p WHERE p.batch_id = b.id) AS product_count
   FROM product_upload_batches b
   ORDER BY b.id`,
);

const [topDupes] = await pool.query(
  `SELECT tag_packet_no, COUNT(*) AS copies
   FROM products WHERE batch_id = ?
   GROUP BY tag_packet_no HAVING COUNT(*) > 1
   ORDER BY copies DESC LIMIT 5`,
  [batchId],
);

console.log(JSON.stringify({ batchId, counts, duplicateTagGroups: dupes.duplicateTagGroups, extraDuplicateRows: extra.extraRows, topDupes, batches }, null, 2));

await pool.end();
