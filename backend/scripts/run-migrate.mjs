import pool from '../src/config/database.js';
import runMigration from '../src/database/migrate.js';

try {
  await runMigration();
  const [batches] = await pool.execute(
    'SELECT id, batch_date, is_active FROM product_upload_batches ORDER BY id DESC LIMIT 3'
  );
  const [counts] = await pool.execute(
    'SELECT batch_id, COUNT(*) AS c FROM products GROUP BY batch_id'
  );
  console.log('Batches:', batches);
  console.log('Product counts by batch:', counts);
} finally {
  await pool.end();
}
