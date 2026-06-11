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
];

const SKIPPABLE_ERROR_CODES = new Set([
  "ER_TABLE_EXISTS_ERR",
  "ER_DUP_FIELDNAME",
  "ER_DUP_KEYNAME",
  "ER_FK_DUP_NAME",
  "ER_CANT_CREATE_TABLE",
]);

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
