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
  "015_dedupe_products_by_tag.sql",
  "016_untagged_products_index.sql",
  "017_latest_stock_verification_scans.sql",
  "018_backfill_latest_stock_verification.sql",
  "021_branches_roles_permissions.sql",
  "022_user_branches.sql",
  "023_drop_users_branch_id.sql",
  "024_drop_branch_is_main_is_active.sql",
  "025_split_master_permissions.sql",
  "026_stock_verification_report_indexes.sql",
  "027_verification_per_branch_latest_scan.sql",
  "028_dashboard_widget_permissions.sql",
  "029_permissions_parent_child.sql",
  "030_user_logs_refresh_tokens.sql",
  "031_remove_branches_view_all.sql",
  "032_db_integrity_cleanup.sql",
  "033_schema_collation_and_indexes.sql",
  "034_product_erp_normalized_tables.sql",
  "035_erp_product_codes.sql",
  "036_print_details_indexes.sql",
];

const SKIPPABLE_ERROR_CODES = new Set([
  "ER_TABLE_EXISTS_ERR",
  "ER_DUP_FIELDNAME",
  "ER_DUP_KEYNAME",
  "ER_FK_DUP_NAME",
  "ER_CANT_CREATE_TABLE",
  "ER_CANT_DROP_FIELD_OR_KEY",
  "ER_BAD_FIELD_ERROR",
]);

async function runSqlFile(file) {
  const sqlPath = path.join(__dirname, "migrations", file);
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
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
