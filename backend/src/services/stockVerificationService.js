import pool from "../config/database.js";
import { getActiveBatchId } from "../services/productBatchService.js";
import ApiError from "../utils/ApiError.js";
import {
  TAG_EXPR,
  buildActiveBatchInventoryFilter,
  normalizeTag,
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

const insertDetailRecords = async (connection, verificationId, records, status) => {
  if (records.length === 0) {
    return;
  }

  const placeholders = records.map(() => "(?, ?, ?, ?)").join(", ");
  const values = records.flatMap((record) => [
    verificationId,
    record.tag,
    status,
    record.itemDescription,
  ]);

  await connection.execute(
    `INSERT INTO stock_verification_details
      (verification_id, tag_no, status, item_description)
     VALUES ${placeholders}`,
    values,
  );
};

const insertDetailRecordsBatched = async (
  connection,
  verificationId,
  records,
  status,
) => {
  for (let index = 0; index < records.length; index += DETAIL_BATCH_SIZE) {
    const chunk = records.slice(index, index + DETAIL_BATCH_SIZE);
    await insertDetailRecords(connection, verificationId, chunk, status);
  }
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

const findScannedTagsInInventory = async (scope, scannedTags) => {
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
           total_expected = ?,
           total_scanned = ?,
           found_count = ?,
           missing_count = ?,
           new_count = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [...headerValues, existingId],
    );

    await connection.execute(
      `DELETE FROM stock_verification_details
       WHERE verification_id = ?
         AND status IN ('FOUND', 'NEW')`,
      [existingId],
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

  const scannedTags = normalizeScannedTags(tagData);
  const found = await findScannedTagsInInventory(scope, scannedTags);
  const foundSet = new Set(found);
  const newTags = scannedTags.filter((tag) => !foundSet.has(tag));
  const missingCount = totalExpected - found.length;

  logVerificationDebug("classification", {
    scannedCount: scannedTags.length,
    foundCount: found.length,
    newCount: newTags.length,
    missingCount,
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
        batchId: activeBatchId,
        totalExpected,
        scannedCount: scannedTags.length,
        foundCount: found.length,
        missingCount,
        newCount: newTags.length,
      },
    );

    const descriptionsByTag = await fetchItemDescriptionsByTags(
      connection,
      found,
      activeBatchId,
    );

    const foundRecords = found.map((tag) => ({
      tag,
      itemDescription: descriptionsByTag.get(tag) || null,
    }));

    await insertDetailRecordsBatched(
      connection,
      verificationId,
      foundRecords,
      "FOUND",
    );

    const newRecords = newTags.map((tag) => ({
      tag,
      itemDescription: null,
    }));

    await insertDetailRecordsBatched(
      connection,
      verificationId,
      newRecords,
      "NEW",
    );

    await connection.commit();

    return {
      verificationId,
      reused,
      batchId: activeBatchId,
      totalExpected,
      totalScanned: scannedTags.length,
      foundCount: found.length,
      missingCount,
      newCount: newTags.length,
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
