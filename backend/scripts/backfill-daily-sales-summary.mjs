import { backfillAllDailySalesSummaries } from "../src/services/dailySalesSummaryService.js";
import pool from "../src/config/database.js";

const extendSessionTimeouts = async (connection) => {
  await connection.query("SET SESSION wait_timeout = 28800");
  await connection.query("SET SESSION interactive_timeout = 28800");
  await connection.query("SET SESSION net_read_timeout = 600");
  await connection.query("SET SESSION net_write_timeout = 600");
};

try {
  const connection = await pool.getConnection();

  try {
    await extendSessionTimeouts(connection);
    await backfillAllDailySalesSummaries(connection);
    console.log("Daily sales summary backfill completed");
  } finally {
    connection.release();
  }
} catch (error) {
  console.error("Backfill failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
