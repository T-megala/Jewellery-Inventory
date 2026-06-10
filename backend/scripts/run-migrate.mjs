import runMigration from "../src/database/migrate.js";
import pool from "../src/config/database.js";

try {
  await runMigration();
} catch (error) {
  console.error("migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
