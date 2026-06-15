import pool from '../src/config/database.js';

const [pair] = await pool.query(`
  SELECT
    p1.id AS id1,
    p2.id AS id2,
    p1.batch_id AS b1,
    p2.batch_id AS b2,
    p1.tag_packet_no AS t1,
    p2.tag_packet_no AS t2,
    (p1.tag_packet_no = p2.tag_packet_no) AS tags_equal
  FROM products p1
  CROSS JOIN products p2
  WHERE p1.id = 328455
    AND p2.id = 366590
`);

const [joinCount] = await pool.query(`
  SELECT COUNT(*) AS cnt
  FROM products p1
  INNER JOIN products p2
    ON p1.batch_id = p2.batch_id
   AND BINARY TRIM(p1.tag_packet_no) = BINARY TRIM(p2.tag_packet_no)
   AND p1.id < p2.id
  WHERE p1.batch_id = 6
`);

console.log(JSON.stringify({ pair, joinCount: joinCount[0] }, null, 2));

await pool.end();
