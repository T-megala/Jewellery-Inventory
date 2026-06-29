/**
 * Apply a single migration file (uses .env DB connection).
 * Usage: node scripts/run-migration.mjs 033_schema_collation_and_indexes.sql
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../src/config/database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2];

if (!file) {
  process.stderr.write("Usage: node scripts/run-migration.mjs <migration-file.sql>\n");
  process.exit(1);
}

const SKIPPABLE = new Set([
  "ER_DUP_KEYNAME",
  "ER_FK_DUP_NAME",
  "ER_CANT_DROP_FIELD_OR_KEY",
]);

const sqlPath = path.join(__dirname, "../src/database/migrations", file);
const sql = fs.readFileSync(sqlPath, "utf8");
const statements = sql
  .replace(/--.*$/gm, "")
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

for (const statement of statements) {
  const preview = statement.replace(/\s+/g, " ").slice(0, 100);
  process.stdout.write(`  ${preview}...\n`);
  try {
    await pool.query(statement);
    process.stdout.write("  done\n");
  } catch (error) {
    if (SKIPPABLE.has(error.code)) {
      process.stdout.write(`  skip (${error.code})\n`);
      continue;
    }
    throw error;
  }
}

process.stdout.write(`OK: ${file}\n`);
await pool.end();
