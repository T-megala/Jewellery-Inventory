import pool from "../config/database.js";
import { resolveOperationalBranchId } from "../utils/branchRequest.js";
import { buildBranchSqlFilter } from "../utils/branchScope.js";
import { getActiveBatchId } from "../services/productBatchService.js";
import ApiError from "../utils/ApiError.js";
import {
  TAG_EXPR,
  buildInventoryScopeFilter,
  normalizeTag,
  resolveStoredScope,
} from "../utils/verificationScope.js";

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

const normalizeScannedTags = (tagData) => [
  ...new Set(tagData.map((tag) => normalizeTag(tag)).filter(Boolean)),
];

const toDetailRecord = (tag, productInfo, scopeLabels) => ({
  tag,
  productName: productInfo?.productName ?? scopeLabels.productName,
  subProductName: productInfo?.subProductName ?? scopeLabels.subProductName,
  centerName: productInfo?.centerName ?? scopeLabels.centerName,
});

const mapRowToProductInfo = (row) => ({
  productName: String(row.product ?? "").trim(),
  subProductName: String(row.sub_product ?? "").trim(),
  centerName: String(row.counter_name ?? "").trim() || "Unassigned",
});

const fetchProductDetailsByTags = async (connection, tags, activeBatchId) => {
  const map = new Map();

  if (tags.length === 0) {
    return map;
  }

  const batchOrderParam = activeBatchId ?? -1;

  for (let index = 0; index < tags.length; index += TAG_LOOKUP_CHUNK_SIZE) {
    const chunk = tags.slice(index, index + TAG_LOOKUP_CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");

    const [rows] = await connection.execute(
      `SELECT ${TAG_EXPR} AS tag, product, sub_product, counter_name, batch_id
       FROM products
       WHERE tag_packet_no IS NOT NULL
         AND TRIM(tag_packet_no) != ''
         AND ${TAG_EXPR} IN (${placeholders})
       ORDER BY
         CASE
           WHEN batch_id = ? THEN 0
           WHEN batch_id IS NULL THEN 1
           ELSE 2
         END,
         id DESC`,
      [...chunk, batchOrderParam],
    );

    for (const row of rows) {
      const tag = normalizeTag(row.tag);

      if (!map.has(tag)) {
        map.set(tag, mapRowToProductInfo(row));
      }
    }
  }

  return map;
};

const insertDetailRecords = async (
  connection,
  verificationId,
  latestScanId,
  records,
  status,
) => {
  if (records.length === 0) {
    return 0;
  }

  const placeholders = records.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
  const values = records.flatMap((record) => [
    verificationId,
    latestScanId,
    record.tag,
    status,
    record.productName,
    record.subProductName,
    record.centerName,
  ]);

  const [result] = await connection.execute(
    `INSERT INTO stock_verification_details
      (verification_id, latest_scan_id, tag_no, status, product_name, sub_product_name, center_name)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       latest_scan_id = VALUES(latest_scan_id),
       status = VALUES(status),
       product_name = VALUES(product_name),
       sub_product_name = VALUES(sub_product_name),
       center_name = VALUES(center_name)`,
    values,
  );

  return Number(result.affectedRows ?? 0);
};

const insertDetailRecordsBatched = async (
  connection,
  verificationId,
  latestScanId,
  records,
  status,
) => {
  let inserted = 0;

  for (let index = 0; index < records.length; index += DETAIL_BATCH_SIZE) {
    const chunk = records.slice(index, index + DETAIL_BATCH_SIZE);
    inserted += await insertDetailRecords(
      connection,
      verificationId,
      latestScanId,
      chunk,
      status,
    );
  }

  return inserted;
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

const sampleExpectedTags = async (scope, limit = 5) => {
  const [rows] = await pool.execute(
    `SELECT DISTINCT ${TAG_EXPR} AS tag
     FROM products
     WHERE ${scope.whereClause}
     ORDER BY tag
     LIMIT ${limit}`,
    scope.params,
  );

  return rows.map((row) => row.tag);
};

const findScannedTagsInScope = async (scope, scannedTags) => {
  if (scannedTags.length === 0) {
    return [];
  }

  const placeholders = scannedTags.map(() => "?").join(", ");
  const sql = `SELECT DISTINCT ${TAG_EXPR} AS tag
     FROM products
     WHERE ${scope.whereClause}
       AND ${TAG_EXPR} IN (${placeholders})`;

  const [rows] = await pool.execute(sql, [...scope.params, ...scannedTags]);

  return rows.map((row) => normalizeTag(row.tag));
};

const buildInventoryDetailRecords = (tags, productDetailsMap, scopeLabels) =>
  tags.map((tag) =>
    toDetailRecord(tag, productDetailsMap.get(tag), scopeLabels),
  );

const buildNewDetailRecords = (tags, scopeLabels) =>
  tags.map((tag) => toDetailRecord(tag, null, scopeLabels));

const findExistingVerificationId = async (
  connection,
  verificationEpochSeconds,
  scopeLabels,
  branchId,
) => {
  const [rows] = await connection.execute(
    `SELECT id
     FROM stock_verification
     WHERE verification_day = DATE(FROM_UNIXTIME(?))
       AND product_name = ?
       AND sub_product_name = ?
       AND center_name = ?
       AND branch_id = ?
     LIMIT 1
     FOR UPDATE`,
    [
      verificationEpochSeconds,
      scopeLabels.productName,
      scopeLabels.subProductName,
      scopeLabels.centerName,
      branchId,
    ],
  );

  return rows[0]?.id ?? null;
};

const upsertVerificationHeader = async (
  connection,
  {
    verificationEpochSeconds,
    datetimeMillis,
    scopeLabels,
    totalExpected,
    branchId = null,
  },
) => {
  const existingId = await findExistingVerificationId(
    connection,
    verificationEpochSeconds,
    scopeLabels,
    branchId,
  );

  if (existingId) {
    await connection.execute(
      `UPDATE stock_verification
       SET verification_date = FROM_UNIXTIME(?),
           verification_day = DATE(FROM_UNIXTIME(?)),
           verification_millis = ?,
           product_name = ?,
           sub_product_name = ?,
           center_name = ?,
           total_expected = ?,
           branch_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        verificationEpochSeconds,
        verificationEpochSeconds,
        datetimeMillis,
        scopeLabels.productName,
        scopeLabels.subProductName,
        scopeLabels.centerName,
        totalExpected,
        branchId,
        existingId,
      ],
    );

    logVerificationDebug("verification-reused", {
      verificationId: existingId,
      verificationDay: verificationEpochSeconds,
      scope: scopeLabels,
    });

    return { verificationId: existingId, reused: true };
  }

  const [headerResult] = await connection.execute(
    `INSERT INTO stock_verification
      (verification_date, verification_day, verification_millis, product_name,
       sub_product_name, center_name, total_expected, total_scanned,
       found_count, missing_count, new_count, branch_id)
     VALUES (FROM_UNIXTIME(?), DATE(FROM_UNIXTIME(?)), ?, ?, ?, ?, ?, 0, 0, 0, 0, ?)`,
    [
      verificationEpochSeconds,
      verificationEpochSeconds,
      datetimeMillis,
      scopeLabels.productName,
      scopeLabels.subProductName,
      scopeLabels.centerName,
      totalExpected,
      branchId,
    ],
  );

  const verificationId = headerResult.insertId;

  logVerificationDebug("verification-created", {
    verificationId,
    verificationDay: verificationEpochSeconds,
    scope: scopeLabels,
  });

  return { verificationId, reused: false };
};

const insertLatestScan = async (
  connection,
  {
    verificationId,
    branchId,
    verificationEpochSeconds,
    datetimeMillis,
    scopeLabels,
    totalExpected,
    scannedCount,
    foundCount,
    missingCount,
    newCount,
  },
) => {
  const [result] = await connection.execute(
    `INSERT INTO latest_stock_verification
      (verification_id, branch_id, verification_date, verification_day, verification_millis,
       product_name, sub_product_name, center_name, total_expected, total_scanned,
       found_count, missing_count, new_count)
     VALUES (?, ?, FROM_UNIXTIME(?), DATE(FROM_UNIXTIME(?)), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      verificationId,
      branchId,
      verificationEpochSeconds,
      verificationEpochSeconds,
      datetimeMillis,
      scopeLabels.productName,
      scopeLabels.subProductName,
      scopeLabels.centerName,
      totalExpected,
      scannedCount,
      foundCount,
      missingCount,
      newCount,
    ],
  );

  return Number(result.insertId);
};

const refreshSessionHeaderCounts = async (
  connection,
  verificationId,
  totalExpected,
) => {
  const [[latestScan]] = await connection.execute(
    `SELECT id, total_scanned
     FROM latest_stock_verification
     WHERE verification_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [verificationId],
  );

  const latestScanId = latestScan?.id ?? null;
  const totalScanned = Number(latestScan?.total_scanned ?? 0);

  let foundCount = 0;
  let newCount = 0;

  if (latestScanId) {
    const [[counts]] = await connection.execute(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'FOUND' THEN 1 ELSE 0 END), 0) AS foundCount,
         COALESCE(SUM(CASE WHEN status = 'NEW' THEN 1 ELSE 0 END), 0) AS newCount
       FROM stock_verification_details
       WHERE verification_id = ?
         AND latest_scan_id = ?`,
      [verificationId, latestScanId],
    );

    foundCount = Number(counts?.foundCount ?? 0);
    newCount = Number(counts?.newCount ?? 0);

    const missingCount = Math.max(totalExpected - foundCount, 0);

    await connection.execute(
      `UPDATE latest_stock_verification
       SET found_count = ?,
           missing_count = ?,
           new_count = ?
       WHERE id = ?`,
      [foundCount, missingCount, newCount, latestScanId],
    );

    await connection.execute(
      `UPDATE stock_verification
       SET total_scanned = ?,
           found_count = ?,
           missing_count = ?,
           new_count = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [totalScanned, foundCount, missingCount, newCount, verificationId],
    );

    return {
      totalScanned,
      foundCount,
      missingCount,
      newCount,
    };
  }

  const missingCount = Math.max(totalExpected - foundCount, 0);

  await connection.execute(
    `UPDATE stock_verification
     SET total_scanned = ?,
         found_count = ?,
         missing_count = ?,
         new_count = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [totalScanned, foundCount, missingCount, newCount, verificationId],
  );

  return {
    totalScanned,
    foundCount,
    missingCount,
    newCount,
  };
};

const uploadStockVerification = async ({
  datetimeMillis,
  product,
  subProduct,
  center,
  tagData,
  branchId = null,
}) => {
  const resolvedBranchId = await resolveOperationalBranchId({ branchId });
  const activeBatchId = await getActiveBatchId(resolvedBranchId);

  if (!activeBatchId) {
    throw new ApiError(
      400,
      "No active product batch found. Upload inventory first.",
    );
  }

  const scope = buildInventoryScopeFilter(
    activeBatchId,
    product,
    subProduct,
    center,
  );

  const { total: totalExpected, sql: countSql } =
    await countExpectedTags(scope);
  const sampleTags = await sampleExpectedTags(scope);

  logVerificationDebug("scope", {
    activeBatchId,
    whereClause: scope.whereClause,
    params: scope.params,
    countSql,
    totalExpected,
    sampleExpectedTags: sampleTags,
  });

  if (totalExpected === 0) {
    throw new ApiError(400, "No inventory tags found for the selected scope.");
  }

  const scopeLabels = resolveStoredScope(product, subProduct, center);

  const scannedTags = normalizeScannedTags(tagData);

  const found = await findScannedTagsInScope(scope, scannedTags);
  const foundSet = new Set(found);
  const newTags = scannedTags.filter((tag) => !foundSet.has(tag));
  const scanFoundCount = found.length;
  const scanNewCount = newTags.length;
  const scanMissingCount = Math.max(totalExpected - scanFoundCount, 0);

  logVerificationDebug("classification", {
    scannedTags,
    found,
    newTags,
    scanMissingCount,
  });

  const connection = await pool.getConnection();

  const verificationEpochSeconds =
    resolveVerificationEpochSeconds(datetimeMillis);

  try {
    await connection.beginTransaction();

    const { verificationId, reused } = await upsertVerificationHeader(
      connection,
      {
        verificationEpochSeconds,
        datetimeMillis,
        scopeLabels,
        totalExpected,
        branchId: resolvedBranchId,
      },
    );

    const latestScanId = await insertLatestScan(connection, {
      verificationId,
      branchId: resolvedBranchId,
      verificationEpochSeconds,
      datetimeMillis,
      scopeLabels,
      totalExpected,
      scannedCount: scannedTags.length,
      foundCount: scanFoundCount,
      missingCount: scanMissingCount,
      newCount: scanNewCount,
    });

    const foundProductDetails = await fetchProductDetailsByTags(
      connection,
      found,
      activeBatchId,
    );

    logVerificationDebug("found-product-details", {
      foundCount: found.length,
      resolvedCount: foundProductDetails.size,
      sample: found.slice(0, 3).map((tag) => ({
        tag,
        details: foundProductDetails.get(tag) ?? null,
      })),
    });

    const foundRecords = buildInventoryDetailRecords(
      found,
      foundProductDetails,
      scopeLabels,
    );

    await insertDetailRecordsBatched(
      connection,
      verificationId,
      latestScanId,
      foundRecords,
      "FOUND",
    );

    const newRecords = buildNewDetailRecords(newTags, scopeLabels);

    await insertDetailRecordsBatched(
      connection,
      verificationId,
      latestScanId,
      newRecords,
      "NEW",
    );

    const sessionTotals = await refreshSessionHeaderCounts(
      connection,
      verificationId,
      totalExpected,
    );

    await connection.commit();

    return {
      verificationId,
      latestScanId,
      reused,
      batchId: activeBatchId,
      totalExpected,
      totalScanned: scannedTags.length,
      foundCount: scanFoundCount,
      missingCount: scanMissingCount,
      newCount: scanNewCount,
      session: sessionTotals,
    };
  } catch (error) {
    await connection.rollback();
    console.error("Stock verification upload failed:", error);
    throw error;
  } finally {
    connection.release();
  }
};

const getServerToday = () => {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const clearVerificationsForDay = async ({ branchIds, date }) => {
  const verificationDay = String(date ?? "").trim();

  if (!verificationDay) {
    throw new ApiError(400, "date is required");
  }

  if (verificationDay !== getServerToday()) {
    throw new ApiError(400, "Only today's verifications can be cleared");
  }

  const branchFilter = buildBranchSqlFilter("sv.branch_id", branchIds);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [detailsResult] = await connection.execute(
      `DELETE svd
       FROM stock_verification_details svd
       INNER JOIN stock_verification sv ON sv.id = svd.verification_id
       WHERE sv.verification_day = ?
         ${branchFilter.clause}`,
      [verificationDay, ...branchFilter.params],
    );

    const [scansResult] = await connection.execute(
      `DELETE lsv
       FROM latest_stock_verification lsv
       INNER JOIN stock_verification sv ON sv.id = lsv.verification_id
       WHERE sv.verification_day = ?
         ${branchFilter.clause}`,
      [verificationDay, ...branchFilter.params],
    );

    const [verificationResult] = await connection.execute(
      `DELETE sv
       FROM stock_verification sv
       WHERE sv.verification_day = ?
         ${branchFilter.clause}`,
      [verificationDay, ...branchFilter.params],
    );

    await connection.commit();

    return {
      date: verificationDay,
      deletedVerifications: Number(verificationResult.affectedRows ?? 0),
      deletedDetails: Number(detailsResult.affectedRows ?? 0),
      deletedScans: Number(scansResult.affectedRows ?? 0),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export default {
  uploadStockVerification,
  clearVerificationsForDay,
  getServerToday,
};
