import { backfillAllDailySalesSummaries } from "../src/services/dailySalesSummaryService.js";
import pool from "../src/config/database.js";

try {
  await backfillAllDailySalesSummaries();
  console.log("Daily sales summary backfill completed");
} catch (error) {
  console.error("Backfill failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
