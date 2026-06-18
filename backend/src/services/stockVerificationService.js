import pool from "../config/database.js";
import { getActiveBatchId } from "../services/productBatchService.js";
import ApiError from "../utils/ApiError.js";
import {
  TAG_EXPR,
  buildInventoryScopeFilter,
  isAllProducts,
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
     VALUES ${placeholders}`,
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

const fetchExistingTagsForVerification = async (connection, verificationId) => {
  const [rows] = await connection.execute(
    `SELECT tag_no
     FROM stock_verification_details
     WHERE verification_id = ?`,
    [verificationId],
  );

  return new Set(rows.map((row) => normalizeTag(row.tag_no)));
};

const filterNewDetailRecords = (records, existingTags) =>
  records.filter((record) => !existingTags.has(record.tag));

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
) => {
  const [rows] = await connection.execute(
    `SELECT id
     FROM stock_verification
     WHERE verification_day = DATE(FROM_UNIXTIME(?))
       AND product_name = ?
       AND sub_product_name = ?
       AND center_name = ?
     LIMIT 1
     FOR UPDATE`,
    [
      verificationEpochSeconds,
      scopeLabels.productName,
      scopeLabels.subProductName,
      scopeLabels.centerName,
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
  },
) => {
  const existingId = await findExistingVerificationId(
    connection,
    verificationEpochSeconds,
    scopeLabels,
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
       found_count, missing_count, new_count)
     VALUES (FROM_UNIXTIME(?), DATE(FROM_UNIXTIME(?)), ?, ?, ?, ?, ?, 0, 0, 0, 0)`,
    [
      verificationEpochSeconds,
      verificationEpochSeconds,
      datetimeMillis,
      scopeLabels.productName,
      scopeLabels.subProductName,
      scopeLabels.centerName,
      totalExpected,
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
      (verification_id, verification_date, verification_day, verification_millis,
       product_name, sub_product_name, center_name, total_expected, total_scanned,
       found_count, missing_count, new_count)
     VALUES (?, FROM_UNIXTIME(?), DATE(FROM_UNIXTIME(?)), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      verificationId,
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
  const [scanResult, foundResult, newResult] = await Promise.all([
    connection.execute(
      `SELECT COALESCE(SUM(total_scanned), 0) AS totalScanned
       FROM latest_stock_verification
       WHERE verification_id = ?`,
      [verificationId],
    ),
    connection.execute(
      `SELECT COUNT(DISTINCT tag_no) AS foundCount
       FROM stock_verification_details
       WHERE verification_id = ?
         AND status = 'FOUND'`,
      [verificationId],
    ),
    connection.execute(
      `SELECT COUNT(DISTINCT tag_no) AS newCount
       FROM stock_verification_details
       WHERE verification_id = ?
         AND status = 'NEW'`,
      [verificationId],
    ),
  ]);

  const totalScanned = Number(scanResult[0][0]?.totalScanned ?? 0);
  const foundCount = Number(foundResult[0][0]?.foundCount ?? 0);
  const newCount = Number(newResult[0][0]?.newCount ?? 0);
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
}) => {
  const allProductsScope = isAllProducts(product);
  const activeBatchId = await getActiveBatchId();

  if (!allProductsScope && !activeBatchId) {
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
    allProductsScope,
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
      },
    );

    const latestScanId = await insertLatestScan(connection, {
      verificationId,
      verificationEpochSeconds,
      datetimeMillis,
      scopeLabels,
      totalExpected,
      scannedCount: scannedTags.length,
      foundCount: scanFoundCount,
      missingCount: scanMissingCount,
      newCount: scanNewCount,
    });

    const existingTags = await fetchExistingTagsForVerification(
      connection,
      verificationId,
    );

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
    const foundRecords = filterNewDetailRecords(
      buildInventoryDetailRecords(found, foundProductDetails, scopeLabels),
      existingTags,
    );

    await insertDetailRecordsBatched(
      connection,
      verificationId,
      latestScanId,
      foundRecords,
      "FOUND",
    );

    const newRecords = filterNewDetailRecords(
      buildNewDetailRecords(newTags, scopeLabels),
      existingTags,
    );

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

export default {
  uploadStockVerification,
};
