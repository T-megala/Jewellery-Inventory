import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../config/database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const files = [
  "001_product_upload_batches.sql",
  "002_create_users_table.sql",
  "003_create_stock_verification.sql",
  "004_alter_products_batch.sql",
  "005_indexes_products.sql",
  "006_indexes_stock_verification.sql",
  "007_create_daily_sales_summary.sql",
  "008_stock_verification_scope_day.sql",
  "009_dedupe_verification_scope_day.sql",
  "010_verification_details_found_new_only.sql",
  "011_inventory_sales_audit.sql",
  "012_simplify_products.sql",
  "013_simplify_dashboard_sales.sql",
  "014_simplify_stock_verification.sql",
  "019_stock_verification_details_qty.sql",
  "020_stock_verification_product_summary.sql",
  "021_verification_day_utc.sql",
];

const SKIPPABLE_ERROR_CODES = new Set([
  "ER_TABLE_EXISTS_ERR",
  "ER_DUP_FIELDNAME",
  "ER_DUP_KEYNAME",
  "ER_FK_DUP_NAME",
  "ER_CANT_CREATE_TABLE",
]);

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

async function shouldSkipFile(file) {
  switch (file) {
    case "009_dedupe_verification_scope_day.sql":
      return !(await columnExists("stock_verification", "product_name"));
    case "012_simplify_products.sql":
      return await columnExists("products", "barcode");
    case "013_simplify_dashboard_sales.sql":
      return await columnExists("inventory_sales_audit", "barcode");
    case "014_simplify_stock_verification.sql":
      return (
        (await columnExists("stock_verification", "batch_id")) &&
        !(await columnExists("stock_verification", "product_name"))
      );
    default:
      return false;
  }
}

async function runSqlFile(file) {
  const sqlPath = path.join(__dirname, "migrations", file);
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.replace(/--.*$/gm, "").trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    const preview = statement.replace(/\s+/g, " ").slice(0, 100);
    process.stdout.write(`  running: ${preview}...\n`);

    try {
      await pool.query(statement);
      process.stdout.write(`  done\n`);
    } catch (error) {
      if (SKIPPABLE_ERROR_CODES.has(error.code)) {
        process.stdout.write(`  skip (${error.code})\n`);
        continue;
      }
      throw error;
    }
  }
}

async function main() {
  for (const file of files) {
    try {
      if (await shouldSkipFile(file)) {
        process.stdout.write(`SKIP: ${file} (schema already up to date)\n`);
        continue;
      }

      await runSqlFile(file);
      process.stdout.write(`OK: ${file}\n`);
    } catch (error) {
      process.stderr.write(`FAIL: ${file} ${error.message}\n`);
      throw error;
    }
  }

  await pool.end();
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
