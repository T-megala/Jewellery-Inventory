import pool from "../config/database.js";
import { getActiveBatchId } from "../services/productBatchService.js";
import ApiError from "../utils/ApiError.js";
import {
  TAG_EXPR,
  buildActiveBatchInventoryFilter,
  normalizeTag,
} from "../utils/verificationScope.js";
import {
  initializeProductSummary,
  refreshProductSummaryForTags,
  refreshSessionProductAggregates,
} from "./verificationProductSummary.js";

const DETAIL_BATCH_SIZE = 500;
const TAG_LOOKUP_CHUNK_SIZE = 500;
const MAX_CLIENT_CLOCK_DRIFT_SECONDS = 7 * 24 * 60 * 60;
const DEBUG = process.env.STOCK_VERIFICATION_DEBUG === "true";

const resolveVerificationEpochSeconds = (datetimeMillis) => {
  const clientSeconds = Math.floor(Number(datetimeMillis) / 1000);
  const serverSeconds = Math.floor(Date.now() / 1000);

  if (
    !Number.isFinite(clientSeconds) ||
    Math.abs(clientSeconds - serverSeconds) > MAX_CLIENT_CLOCK_DRIFT_SECONDS
  ) {
    return serverSeconds;
  }

  return clientSeconds;
};

const logVerificationDebug = (label, payload) => {
  if (!DEBUG) {
    return;
  }

  console.info(`[stock-verification] ${label}`, payload);
};

const normalizeScannedTags = (tagData) =>
  tagData.map((tag) => normalizeTag(tag)).filter(Boolean);

const buildScanCounts = (tags) => {
  const counts = new Map();

  for (const tag of tags) {
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }

  return counts;
};

const fetchItemDescriptionsByTags = async (connection, tags, batchId) => {
  const map = new Map();

  if (tags.length === 0) {
    return map;
  }

  for (let index = 0; index < tags.length; index += TAG_LOOKUP_CHUNK_SIZE) {
    const chunk = tags.slice(index, index + TAG_LOOKUP_CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");

    const [rows] = await connection.execute(
      `SELECT ${TAG_EXPR} AS tag, item_description
       FROM products
       WHERE batch_id = ?
         AND barcode IS NOT NULL
         AND TRIM(barcode) != ''
         AND ${TAG_EXPR} IN (${placeholders})`,
      [batchId, ...chunk],
    );

    for (const row of rows) {
      const tag = normalizeTag(row.tag);

      if (!map.has(tag)) {
        map.set(tag, String(row.item_description ?? "").trim());
      }
    }
  }

  return map;
};

const upsertDetailRecords = async (
  connection,
  verificationId,
  records,
  status,
) => {
  if (records.length === 0) {
    return;
  }

  if (status === "FOUND") {
    const placeholders = records.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const values = records.flatMap((record) => [
      verificationId,
      record.tag,
      status,
      record.itemDescription,
      record.expectedQty,
      record.scannedQty,
      record.foundQty,
      record.missingQty,
    ]);

    await connection.execute(
      `INSERT INTO stock_verification_details
        (verification_id, tag_no, status, item_description,
         expected_qty, scanned_qty, found_qty, missing_qty)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         item_description = COALESCE(VALUES(item_description), item_description),
         expected_qty = VALUES(expected_qty),
         scanned_qty = scanned_qty + VALUES(scanned_qty),
         found_qty = LEAST(
           VALUES(expected_qty),
           scanned_qty + VALUES(scanned_qty)
         ),
         missing_qty = GREATEST(
           VALUES(expected_qty) - LEAST(
             VALUES(expected_qty),
             scanned_qty + VALUES(scanned_qty)
           ),
           0
         ),
         status = 'FOUND'`,
      values,
    );
    return;
  }

  const placeholders = records.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const values = records.flatMap((record) => [
    verificationId,
    record.tag,
    status,
    record.itemDescription,
    record.expectedQty,
    record.scannedQty,
    record.foundQty,
    record.missingQty,
  ]);

  await connection.execute(
    `INSERT INTO stock_verification_details
      (verification_id, tag_no, status, item_description,
       expected_qty, scanned_qty, found_qty, missing_qty)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       scanned_qty = scanned_qty + VALUES(scanned_qty)`,
    values,
  );
};

const upsertDetailRecordsBatched = async (
  connection,
  verificationId,
  records,
  status,
) => {
  for (let index = 0; index < records.length; index += DETAIL_BATCH_SIZE) {
    const chunk = records.slice(index, index + DETAIL_BATCH_SIZE);
    await upsertDetailRecords(connection, verificationId, chunk, status);
  }
};

const refreshSessionHeaderCounts = async (connection, verificationId, batchId) => {
  const [[inventory]] = await connection.execute(
    `SELECT COUNT(DISTINCT ${TAG_EXPR}) AS totalExpected
     FROM products
     WHERE batch_id = ?
       AND barcode IS NOT NULL
       AND TRIM(barcode) != ''`,
    [batchId],
  );

  const [[foundStats]] = await connection.execute(
    `SELECT COALESCE(SUM(found_qty), 0) AS foundQty
     FROM stock_verification_details
     WHERE verification_id = ?
       AND status = 'FOUND'`,
    [verificationId],
  );

  const [[newStats]] = await connection.execute(
    `SELECT COALESCE(SUM(scanned_qty), 0) AS newQty
     FROM stock_verification_details
     WHERE verification_id = ?
       AND status = 'NEW'`,
    [verificationId],
  );

  const [[missingStats]] = await connection.execute(
    `SELECT
       SUM(
         CASE
           WHEN GREATEST(
             p.closing_bal_qty - COALESCE(fd.found_qty, 0),
             0
           ) > 0 THEN 1
           ELSE 0
         END
       ) AS missingBarcodeCount
     FROM products p
     LEFT JOIN (
       SELECT tag_no, SUM(found_qty) AS found_qty
       FROM stock_verification_details
       WHERE verification_id = ?
         AND status = 'FOUND'
       GROUP BY tag_no
     ) fd ON fd.tag_no = ${TAG_EXPR}
     WHERE p.batch_id = ?
       AND p.barcode IS NOT NULL
       AND TRIM(p.barcode) != ''`,
    [verificationId, batchId],
  );

  await connection.execute(
    `UPDATE stock_verification
     SET total_expected = ?,
         found_count = ?,
         missing_count = ?,
         new_count = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      Number(inventory?.totalExpected ?? 0),
      Number(foundStats?.foundQty ?? 0),
      Number(missingStats?.missingBarcodeCount ?? 0),
      Number(newStats?.newQty ?? 0),
      verificationId,
    ],
  );

  return {
    totalExpected: Number(inventory?.totalExpected ?? 0),
    foundCount: Number(foundStats?.foundQty ?? 0),
    missingCount: Number(missingStats?.missingBarcodeCount ?? 0),
    newCount: Number(newStats?.newQty ?? 0),
    tagStats: {
      totalExpectedTags: Number(inventory?.totalExpected ?? 0),
      totalFoundTags: Number(foundStats?.foundQty ?? 0),
      totalMissingTags: Number(missingStats?.missingBarcodeCount ?? 0),
      totalNewTags: Number(newStats?.newQty ?? 0),
    },
  };
};

const countExpectedTags = async (scope) => {
  const sql = `SELECT COUNT(DISTINCT ${TAG_EXPR}) AS total
     FROM products
     WHERE ${scope.whereClause}`;

  const [rows] = await pool.execute(sql, scope.params);

  return {
    total: Number(rows[0]?.total ?? 0),
    sql,
  };
};

const fetchInventoryByTags = async (connection, tags, batchId) => {
  const map = new Map();

  if (tags.length === 0) {
    return map;
  }

  for (let index = 0; index < tags.length; index += TAG_LOOKUP_CHUNK_SIZE) {
    const chunk = tags.slice(index, index + TAG_LOOKUP_CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");

    const [rows] = await connection.execute(
      `SELECT ${TAG_EXPR} AS tag, item_description, closing_bal_qty
       FROM products
       WHERE batch_id = ?
         AND barcode IS NOT NULL
         AND TRIM(barcode) != ''
         AND ${TAG_EXPR} IN (${placeholders})`,
      [batchId, ...chunk],
    );

    for (const row of rows) {
      const tag = normalizeTag(row.tag);

      if (!map.has(tag)) {
        map.set(tag, {
          itemDescription: String(row.item_description ?? "").trim() || null,
          expectedQty: Number(row.closing_bal_qty ?? 0),
        });
      }
    }
  }

  return map;
};

const findExistingVerificationId = async (connection, verificationEpochSeconds) => {
  const [rows] = await connection.execute(
    `SELECT id
     FROM stock_verification
     WHERE verification_day = DATE(FROM_UNIXTIME(?))
     LIMIT 1
     FOR UPDATE`,
    [verificationEpochSeconds],
  );

  return rows[0]?.id ?? null;
};

const upsertVerificationHeader = async (
  connection,
  {
    verificationEpochSeconds,
    datetimeMillis,
    batchId,
    totalExpected,
    scannedCount,
    foundCount,
    missingCount,
    newCount,
  },
) => {
  const existingId = await findExistingVerificationId(
    connection,
    verificationEpochSeconds,
  );

  const headerValues = [
    batchId,
    verificationEpochSeconds,
    verificationEpochSeconds,
    datetimeMillis,
    totalExpected,
    scannedCount,
    foundCount,
    missingCount,
    newCount,
  ];

  if (existingId) {
    await connection.execute(
      `UPDATE stock_verification
       SET batch_id = ?,
           verification_date = FROM_UNIXTIME(?),
           verification_day = DATE(FROM_UNIXTIME(?)),
           verification_millis = ?,
           total_scanned = total_scanned + ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        batchId,
        verificationEpochSeconds,
        verificationEpochSeconds,
        datetimeMillis,
        scannedCount,
        existingId,
      ],
    );

    logVerificationDebug("verification-reused", {
      verificationId: existingId,
      verificationDay: verificationEpochSeconds,
      batchId,
    });

    return { verificationId: existingId, reused: true };
  }

  const [headerResult] = await connection.execute(
    `INSERT INTO stock_verification
      (batch_id, verification_date, verification_day, verification_millis,
       total_expected, total_scanned, found_count, missing_count, new_count)
     VALUES (?, FROM_UNIXTIME(?), DATE(FROM_UNIXTIME(?)), ?, ?, ?, ?, ?, ?)`,
    headerValues,
  );

  const verificationId = headerResult.insertId;

  logVerificationDebug("verification-created", {
    verificationId,
    verificationDay: verificationEpochSeconds,
    batchId,
  });

  return { verificationId, reused: false };
};

const uploadStockVerification = async ({ datetimeMillis, tagData }) => {
  const activeBatchId = await getActiveBatchId();

  if (!activeBatchId) {
    throw new ApiError(
      400,
      "No active product batch found. Upload inventory first.",
    );
  }

  const scope = buildActiveBatchInventoryFilter(activeBatchId);
  const { total: totalExpected, sql: countSql } = await countExpectedTags(scope);

  logVerificationDebug("inventory-scope", {
    activeBatchId,
    whereClause: scope.whereClause,
    countSql,
    totalExpected,
  });

  if (totalExpected === 0) {
    throw new ApiError(400, "No inventory barcodes found in the active batch.");
  }

  // IMPORTANT: do NOT de-dupe scanned tags, we need quantity per barcode.
  const scannedTags = normalizeScannedTags(tagData);
  const scanCounts = buildScanCounts(scannedTags);
  const scannedDistinct = [...scanCounts.keys()];

  logVerificationDebug("classification", {
    scannedCount: scannedTags.length,
    scannedDistinctCount: scannedDistinct.length,
  });

  const connection = await pool.getConnection();
  const verificationEpochSeconds =
    resolveVerificationEpochSeconds(datetimeMillis);

  try {
    await connection.beginTransaction();

    const inventoryByTag = await fetchInventoryByTags(
      connection,
      scannedDistinct,
      activeBatchId,
    );

    const foundRecords = [];
    const newRecords = [];

    let scanExpectedQty = 0;
    let scanFoundQty = 0;
    let scanMissingQty = 0;
    let scanNewQty = 0;

    for (const [tag, scannedQty] of scanCounts.entries()) {
      const inventory = inventoryByTag.get(tag);

      if (!inventory) {
        scanNewQty += scannedQty;
        newRecords.push({
          tag,
          itemDescription: null,
          expectedQty: 0,
          scannedQty,
          foundQty: 0,
          missingQty: 0,
        });
        continue;
      }

      const expectedQty = Number(inventory.expectedQty ?? 0);
      const foundQty = Math.min(scannedQty, expectedQty);
      const missingQty = Math.max(expectedQty - foundQty, 0);

      scanExpectedQty += expectedQty;
      scanFoundQty += foundQty;
      scanMissingQty += missingQty;

      foundRecords.push({
        tag,
        itemDescription: inventory.itemDescription,
        expectedQty,
        scannedQty,
        foundQty,
        missingQty,
      });
    }

    scanNewQty = newRecords.reduce((sum, row) => sum + row.scannedQty, 0);

    const { verificationId, reused } = await upsertVerificationHeader(
      connection,
      {
        verificationEpochSeconds,
        datetimeMillis,
        batchId: activeBatchId,
        totalExpected,
        scannedCount: scannedTags.length,
        foundCount: 0,
        missingCount: 0,
        newCount: 0,
      },
    );

    await initializeProductSummary(connection, verificationId, activeBatchId);

    await upsertDetailRecordsBatched(
      connection,
      verificationId,
      foundRecords,
      "FOUND",
    );

    await upsertDetailRecordsBatched(
      connection,
      verificationId,
      newRecords,
      "NEW",
    );

    await refreshProductSummaryForTags(
      connection,
      verificationId,
      scannedDistinct,
    );

    const sessionTotals = await refreshSessionHeaderCounts(
      connection,
      verificationId,
      activeBatchId,
    );

    const productAggregates = await refreshSessionProductAggregates(
      connection,
      verificationId,
      activeBatchId,
      sessionTotals.tagStats,
    );

    await connection.commit();

    return {
      verificationId,
      reused,
      batchId: activeBatchId,
      totalExpected: sessionTotals.totalExpected,
      totalScanned: scannedTags.length,
      scanExpectedQty: Math.round(scanExpectedQty),
      foundCount: sessionTotals.foundCount,
      missingCount: sessionTotals.missingCount,
      newCount: sessionTotals.newCount,
      scanFoundQty: Math.round(scanFoundQty),
      scanMissingQty: Math.round(scanMissingQty),
      scanNewQty: Math.round(scanNewQty),
      summary: {
        tagCounts: {
          foundCount: sessionTotals.foundCount,
          missingCount: sessionTotals.missingCount,
          newCount: sessionTotals.newCount,
        },
        productCounts: productAggregates.productCounts,
        totalExpectedTags: sessionTotals.tagStats.totalExpectedTags,
        totalFoundTags: sessionTotals.tagStats.totalFoundTags,
        totalMissingTags: sessionTotals.tagStats.totalMissingTags,
        totalNewTags: sessionTotals.tagStats.totalNewTags,
        overallVerificationPercentage:
          productAggregates.overallVerificationPercentage,
      },
      byBarcode: [
        ...foundRecords.map((row) => ({
          barcode: row.tag,
          itemDescription: row.itemDescription,
          expectedQty: row.expectedQty,
          scannedQty: row.scannedQty,
          foundQty: row.foundQty,
          missingQty: row.missingQty,
          status: "FOUND",
        })),
        ...newRecords.map((row) => ({
          barcode: row.tag,
          itemDescription: null,
          expectedQty: 0,
          scannedQty: row.scannedQty,
          foundQty: 0,
          missingQty: 0,
          status: "NEW",
        })),
      ],
    };
  } catch (error) {
    await connection.rollback();
    console.error("Stock verification upload failed:", error);
    throw error;
  } finally {
    connection.release();
  }
};

export default {
  uploadStockVerification,
};
