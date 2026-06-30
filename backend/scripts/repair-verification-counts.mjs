#!/usr/bin/env node
/**
 * Repair verification header counts and align detail rows with the latest scan.
 * Run after fixing rescan/report logic: node scripts/repair-verification-counts.mjs
 */
import 'dotenv/config';
import pool from '../src/config/database.js';

const [verifications] = await pool.query(
  `SELECT id, total_expected FROM stock_verification ORDER BY id`,
);

for (const verification of verifications) {
  const verificationId = verification.id;
  const totalExpected = Number(verification.total_expected ?? 0);

  const [[latestScan]] = await pool.query(
    `SELECT id, total_scanned
     FROM latest_stock_verification
     WHERE verification_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [verificationId],
  );

  if (!latestScan?.id) {
    continue;
  }

  await pool.query(
    `UPDATE stock_verification_details
     SET latest_scan_id = ?
     WHERE verification_id = ?
       AND status IN ('FOUND', 'NEW')`,
    [latestScan.id, verificationId],
  );

  const [[counts]] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'FOUND' THEN 1 ELSE 0 END), 0) AS foundCount,
       COALESCE(SUM(CASE WHEN status = 'NEW' THEN 1 ELSE 0 END), 0) AS newCount
     FROM stock_verification_details
     WHERE verification_id = ?
       AND latest_scan_id = ?`,
    [verificationId, latestScan.id],
  );

  const foundCount = Number(counts.foundCount ?? 0);
  const newCount = Number(counts.newCount ?? 0);
  const missingCount = Math.max(totalExpected - foundCount, 0);
  const totalScanned = Number(latestScan.total_scanned ?? 0);

  await pool.query(
    `UPDATE latest_stock_verification
     SET found_count = ?, missing_count = ?, new_count = ?
     WHERE id = ?`,
    [foundCount, missingCount, newCount, latestScan.id],
  );

  await pool.query(
    `UPDATE stock_verification
     SET total_scanned = ?, found_count = ?, missing_count = ?, new_count = ?
     WHERE id = ?`,
    [totalScanned, foundCount, missingCount, newCount, verificationId],
  );

  console.log(
    `verification #${verificationId}: found=${foundCount} missing=${missingCount} new=${newCount}`,
  );
}

console.log('Repair complete.');
await pool.end();
