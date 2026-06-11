/**
 * Test Helper: Stock Verification Missing Tags
 * 
 * This file provides utility functions to test and verify the MISSING tags
 * dynamic generation implementation.
 * 
 * Usage:
 * - Run with: node backend/test/stockVerificationMissingTest.mjs
 * - Or import functions in your test suite
 */

import pool from "../src/config/database.js";

/**
 * Verifies that MISSING records are NOT stored in the database
 */
export const testNoStoredMissingRecords = async () => {
  const [rows] = await pool.execute(
    "SELECT COUNT(*) as count FROM stock_verification_details WHERE status = 'MISSING'"
  );

  const missingCount = Number(rows[0]?.count ?? 0);

  if (missingCount === 0) {
    console.log("✅ PASS: No MISSING records stored in database");
    return true;
  } else {
    console.log(`❌ FAIL: Found ${missingCount} MISSING records (should be 0)`);
    return false;
  }
};

/**
 * Verifies that FOUND and NEW records ARE stored in the database
 */
export const testFoundAndNewRecordsStored = async () => {
  const [rows] = await pool.execute(`
    SELECT status, COUNT(*) as count
    FROM stock_verification_details
    WHERE status IN ('FOUND', 'NEW')
    GROUP BY status
  `);

  if (rows.length > 0) {
    console.log("✅ PASS: FOUND and NEW records are stored");
    rows.forEach(row => {
      console.log(`   - ${row.status}: ${row.count} records`);
    });
    return true;
  } else {
    console.log("❌ FAIL: No FOUND or NEW records found");
    return false;
  }
};

/**
 * Tests the dynamic MISSING query generation
 */
export const testDynamicMissingQuery = async (verificationId) => {
  // Get expected tags
  const [expectedRows] = await pool.execute(`
    SELECT COUNT(DISTINCT UPPER(TRIM(p.tag_packet_no))) as expected
    FROM products p
    INNER JOIN stock_verification sv ON sv.id = ?
    WHERE p.tag_packet_no IS NOT NULL
      AND TRIM(p.tag_packet_no) != ''
      AND (
        sv.product_name = 'All Products'
        OR p.product = sv.product_name
      )
  `, [verificationId]);

  const expectedCount = Number(expectedRows[0]?.expected ?? 0);

  // Get found tags
  const [foundRows] = await pool.execute(`
    SELECT COUNT(*) as found
    FROM stock_verification_details
    WHERE verification_id = ?
      AND status = 'FOUND'
  `, [verificationId]);

  const foundCount = Number(foundRows[0]?.found ?? 0);

  // Calculate missing dynamically
  const dynamicMissingCount = expectedCount - foundCount;

  // Get missing from header
  const [headerRows] = await pool.execute(`
    SELECT missing_count FROM stock_verification WHERE id = ?
  `, [verificationId]);

  const headerMissingCount = Number(headerRows[0]?.missing_count ?? 0);

  console.log(`\nVerification #${verificationId}:`);
  console.log(`  Expected tags: ${expectedCount}`);
  console.log(`  Found tags:    ${foundCount}`);
  console.log(`  Dynamic missing: ${dynamicMissingCount}`);
  console.log(`  Header missing:  ${headerMissingCount}`);

  if (dynamicMissingCount === headerMissingCount) {
    console.log("✅ PASS: Dynamic MISSING count matches header");
    return true;
  } else {
    console.log("❌ FAIL: Dynamic MISSING count does not match header");
    return false;
  }
};

/**
 * Tests database performance metrics
 */
export const testDatabaseMetrics = async () => {
  // Get total size of stock_verification_details
  const [sizeRows] = await pool.execute(`
    SELECT 
      ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as size_mb
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'stock_verification_details'
  `);

  const tableSizeMb = Number(sizeRows[0]?.size_mb ?? 0);

  // Get record breakdown
  const [recordRows] = await pool.execute(`
    SELECT 
      status,
      COUNT(*) as record_count
    FROM stock_verification_details
    GROUP BY status
    ORDER BY status
  `);

  console.log("\nDatabase Metrics:");
  console.log(`  Table size: ${tableSizeMb} MB`);
  console.log("  Record breakdown:");
  recordRows.forEach(row => {
    console.log(`    - ${row.status}: ${row.record_count}`);
  });

  return true;
};

/**
 * Tests query execution time
 */
export const testQueryPerformance = async (verificationId) => {
  const activeBatchId = -1; // Or get actual active batch

  const startTime = Date.now();

  const [rows] = await pool.execute(`
    SELECT
      sv.id AS verification_id,
      UPPER(TRIM(p.tag_packet_no)) AS tag_no,
      'MISSING' AS status
    FROM stock_verification sv
    INNER JOIN products p ON
      p.tag_packet_no IS NOT NULL
      AND TRIM(p.tag_packet_no) != ''
      AND (
        sv.product_name = 'All Products'
        OR p.product = sv.product_name
      )
    WHERE sv.id = ?
      AND NOT EXISTS (
        SELECT 1
        FROM stock_verification_details svd_found
        WHERE svd_found.verification_id = sv.id
          AND svd_found.tag_no = UPPER(TRIM(p.tag_packet_no))
          AND svd_found.status = 'FOUND'
      )
    GROUP BY sv.id, UPPER(TRIM(p.tag_packet_no))
    LIMIT 100
  `, [verificationId]);

  const endTime = Date.now();
  const executionTime = endTime - startTime;

  console.log(`\nQuery Performance (Verification #${verificationId}):`);
  console.log(`  Execution time: ${executionTime}ms`);
  console.log(`  Results returned: ${rows.length}`);

  if (executionTime < 500) {
    console.log("✅ PASS: Query executed within acceptable time");
    return true;
  } else {
    console.log("⚠️ WARNING: Query took longer than expected");
    return false;
  }
};

/**
 * Run all tests
 */
export const runAllTests = async (verificationId) => {
  console.log("=".repeat(60));
  console.log("Stock Verification Missing Tags - Test Suite");
  console.log("=".repeat(60));

  const results = [];

  try {
    // Test 1
    console.log("\n[Test 1] Verify no MISSING records stored");
    results.push(await testNoStoredMissingRecords());

    // Test 2
    console.log("\n[Test 2] Verify FOUND and NEW records stored");
    results.push(await testFoundAndNewRecordsStored());

    // Test 3
    if (verificationId) {
      console.log("\n[Test 3] Test dynamic MISSING calculation");
      results.push(await testDynamicMissingQuery(verificationId));

      // Test 4
      console.log("\n[Test 4] Test query performance");
      results.push(await testQueryPerformance(verificationId));
    }

    // Test 5
    console.log("\n[Test 5] Database metrics");
    results.push(await testDatabaseMetrics());

    // Summary
    const passed = results.filter(r => r).length;
    const total = results.length;

    console.log("\n" + "=".repeat(60));
    console.log(`Test Results: ${passed}/${total} passed`);
    console.log("=".repeat(60));

    return passed === total;
  } catch (error) {
    console.error("❌ Test execution failed:", error);
    return false;
  }
};

// Run tests if this file is executed directly
const args = process.argv.slice(2);
const verificationId = args[0] ? Number(args[0]) : null;

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const success = await runAllTests(verificationId);
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}
