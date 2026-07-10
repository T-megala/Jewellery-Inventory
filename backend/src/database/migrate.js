import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../config/database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const files = fs
  .readdirSync(path.join(__dirname, "migrations"))
  .filter((file) => path.extname(file).toLowerCase() === ".sql")
  .sort();

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
