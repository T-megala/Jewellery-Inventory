import pool from '../src/config/database.js';

const [result] = await pool.execute(
  `UPDATE stock_verification
   SET verification_date = created_at
   WHERE ABS(DATEDIFF(DATE(verification_date), DATE(created_at))) > 7
      OR YEAR(verification_date) <> YEAR(created_at)`
);

console.log('updated rows', result.affectedRows);
await pool.end();
