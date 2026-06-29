/**
 * Run DB integrity cleanup on any environment configured in .env
 *
 * Usage:
 *   node scripts/fix-db-integrity.mjs              # cleanup + FKs + sales backfill
 *   node scripts/fix-db-integrity.mjs --dry-run    # report only, no changes
 *   node scripts/fix-db-integrity.mjs --skip-backfill
 *
 * Or run SQL only on another server:
 *   mysql -h HOST -u USER -p DATABASE < src/database/migrations/032_db_integrity_cleanup.sql
 *   mysql -h HOST -u USER -p DATABASE < src/database/migrations/033_schema_collation_and_indexes.sql
 *   node scripts/backfill-daily-sales-summary.mjs
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../src/config/database.js";
import { backfillAllDailySalesSummaries } from "../src/services/dailySalesSummaryService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");
const skipBackfill = process.argv.includes("--skip-backfill");

const SKIPPABLE_ERROR_CODES = new Set([
  "ER_DUP_KEYNAME",
  "ER_FK_DUP_NAME",
  "ER_CANT_DROP_FIELD_OR_KEY",
]);

async function countOrphans() {
  const [rows] = await pool.execute(
    `SELECT
      (SELECT COUNT(*) FROM daily_sales_summary dss
         LEFT JOIN product_upload_batches b ON b.id = dss.batch_id
         WHERE b.id IS NULL) AS dss_orphans,
      (SELECT COUNT(*) FROM inventory_sales_audit isa
         LEFT JOIN product_upload_batches b ON b.id = isa.batch_id
         WHERE b.id IS NULL) AS isa_batch_orphans,
      (SELECT COUNT(*) FROM inventory_sales_audit isa
         LEFT JOIN product_upload_batches pb ON pb.id = isa.previous_batch_id
         WHERE pb.id IS NULL) AS isa_prev_orphans,
      (SELECT COUNT(*) FROM inventory_sales_audit isa
         INNER JOIN product_upload_batches b ON b.id = isa.batch_id
         INNER JOIN product_upload_batches pb ON pb.id = isa.previous_batch_id
         WHERE b.branch_id IS NOT NULL
           AND pb.branch_id IS NOT NULL
           AND b.branch_id <> pb.branch_id) AS isa_cross_branch,
      (SELECT COUNT(*) FROM stock_verification WHERE branch_id IS NULL) AS sv_null_branch,
      (SELECT COUNT(*) FROM latest_stock_verification WHERE branch_id IS NULL) AS lsv_null_branch`
  );
  return rows[0];
}

async function runStatement(statement) {
  const preview = statement.replace(/\s+/g, " ").slice(0, 120);
  process.stdout.write(`  ${preview}...\n`);

  if (dryRun) {
    process.stdout.write("  (dry-run skip)\n");
    return { affectedRows: 0 };
  }

  try {
    const [result] = await pool.query(statement);
    const affected =
      typeof result.affectedRows === "number" ? result.affectedRows : 0;
    process.stdout.write(`  done (${affected} rows affected)\n`);
    return result;
  } catch (error) {
    if (SKIPPABLE_ERROR_CODES.has(error.code)) {
      process.stdout.write(`  skip (${error.code})\n`);
      return null;
    }
    throw error;
  }
}

async function runMigrationFile() {
  const sqlPath = path.join(
    __dirname,
    "../src/database/migrations/032_db_integrity_cleanup.sql"
  );
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await runStatement(statement);
  }
}

async function extendSessionTimeouts(connection) {
  await connection.query("SET SESSION wait_timeout = 28800");
  await connection.query("SET SESSION interactive_timeout = 28800");
  await connection.query("SET SESSION net_read_timeout = 600");
  await connection.query("SET SESSION net_write_timeout = 600");
}

async function main() {
  const db = process.env.DB_NAME;
  process.stdout.write(`Database: ${db}\n`);
  if (dryRun) process.stdout.write("Mode: DRY RUN (no changes)\n\n");

  process.stdout.write("Before:\n");
  console.log(await countOrphans());

  process.stdout.write("\nRunning 032_db_integrity_cleanup.sql...\n");
  await runMigrationFile();

  if (!dryRun && !skipBackfill) {
    process.stdout.write("\nRebuilding daily_sales_summary from inventory...\n");
    const connection = await pool.getConnection();
    try {
      await extendSessionTimeouts(connection);
      await backfillAllDailySalesSummaries(connection);
      process.stdout.write("Daily sales summary backfill completed\n");
    } finally {
      connection.release();
    }
  } else if (skipBackfill) {
    process.stdout.write("\nSkipped sales backfill (--skip-backfill)\n");
  }

  process.stdout.write("\nAfter:\n");
  console.log(await countOrphans());
  process.stdout.write("\nDone.\n");
}

main()
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
