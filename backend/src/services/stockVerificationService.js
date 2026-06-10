import pool from '../config/database.js';
import { getActiveBatchId } from '../services/productBatchService.js';
import ApiError from '../utils/ApiError.js';
import {
  TAG_EXPR,
  buildInventoryScopeFilter,
  isAllProducts,
  normalizeTag,
  resolveStoredScope,
} from '../utils/verificationScope.js';

const DETAIL_BATCH_SIZE = 500;
const MISSING_FETCH_SIZE = 2000;
const TAG_LOOKUP_CHUNK_SIZE = 500;
const MAX_CLIENT_CLOCK_DRIFT_SECONDS = 7 * 24 * 60 * 60;
const DEBUG = process.env.STOCK_VERIFICATION_DEBUG === 'true';

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
  ...new Set(
    tagData
      .map((tag) => normalizeTag(tag))
      .filter(Boolean)
  ),
];

const toDetailRecord = (tag, productInfo, scopeLabels) => ({
  tag,
  productName: productInfo?.productName ?? scopeLabels.productName,
  subProductName: productInfo?.subProductName ?? scopeLabels.subProductName,
  centerName: productInfo?.centerName ?? scopeLabels.centerName,
});

const mapRowToProductInfo = (row) => ({
  productName: String(row.product ?? '').trim(),
  subProductName: String(row.sub_product ?? '').trim(),
  centerName: String(row.counter_name ?? '').trim() || 'Unassigned',
});

const fetchProductDetailsByTags = async (connection, tags, activeBatchId) => {
  const map = new Map();

  if (tags.length === 0) {
    return map;
  }

  const batchOrderParam = activeBatchId ?? -1;

  for (let index = 0; index < tags.length; index += TAG_LOOKUP_CHUNK_SIZE) {
    const chunk = tags.slice(index, index + TAG_LOOKUP_CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(', ');

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
      [...chunk, batchOrderParam]
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

const insertDetailRecords = async (connection, verificationId, records, status) => {
  if (records.length === 0) {
    return;
  }

  const placeholders = records.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
  const values = records.flatMap((record) => [
    verificationId,
    record.tag,
    status,
    record.productName,
    record.subProductName,
    record.centerName,
  ]);

  await connection.execute(
    `INSERT INTO stock_verification_details
      (verification_id, tag_no, status, product_name, sub_product_name, center_name)
     VALUES ${placeholders}`,
    values
  );
};

const insertDetailRecordsBatched = async (
  connection,
  verificationId,
  records,
  status
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

const sampleExpectedTags = async (scope, limit = 5) => {
  const [rows] = await pool.execute(
    `SELECT DISTINCT ${TAG_EXPR} AS tag
     FROM products
     WHERE ${scope.whereClause}
     ORDER BY tag
     LIMIT ${limit}`,
    scope.params
  );

  return rows.map((row) => row.tag);
};

const findScannedTagsInScope = async (scope, scannedTags) => {
  if (scannedTags.length === 0) {
    return [];
  }

  const placeholders = scannedTags.map(() => '?').join(', ');
  const sql = `SELECT DISTINCT ${TAG_EXPR} AS tag
     FROM products
     WHERE ${scope.whereClause}
       AND ${TAG_EXPR} IN (${placeholders})`;

  const [rows] = await pool.execute(sql, [...scope.params, ...scannedTags]);

  return rows.map((row) => normalizeTag(row.tag));
};

const buildInventoryDetailRecords = (tags, productDetailsMap, scopeLabels) =>
  tags.map((tag) =>
    toDetailRecord(tag, productDetailsMap.get(tag), scopeLabels)
  );

const buildNewDetailRecords = (tags, scopeLabels) =>
  tags.map((tag) => toDetailRecord(tag, null, scopeLabels));

const fetchMissingTagsBatch = async (
  connection,
  scope,
  scannedTags,
  lastTag
) => {
  const notInClause =
    scannedTags.length > 0
      ? `AND ${TAG_EXPR} NOT IN (${scannedTags.map(() => '?').join(', ')})`
      : '';
  const paginationClause = lastTag ? `AND ${TAG_EXPR} > ?` : '';
  const params = [...scope.params, ...scannedTags];

  if (lastTag) {
    params.push(lastTag);
  }

  const [rows] = await connection.execute(
    `SELECT DISTINCT ${TAG_EXPR} AS tag
     FROM products
     WHERE ${scope.whereClause}
       ${notInClause}
       ${paginationClause}
     ORDER BY tag
     LIMIT ${MISSING_FETCH_SIZE}`,
    params
  );

  return rows.map((row) => normalizeTag(row.tag));
};

const insertMissingDetails = async (
  connection,
  scope,
  scannedTags,
  verificationId,
  scopeLabels,
  activeBatchId
) => {
  let lastTag = null;
  let batchIndex = 0;

  while (true) {
    const tags = await fetchMissingTagsBatch(
      connection,
      scope,
      scannedTags,
      lastTag
    );

    if (tags.length === 0) {
      break;
    }

    batchIndex += 1;
    logVerificationDebug('missing-details-batch', {
      batchIndex,
      batchSize: tags.length,
      lastTag,
    });

    const productDetailsMap = await fetchProductDetailsByTags(
      connection,
      tags,
      activeBatchId
    );
    const records = buildInventoryDetailRecords(
      tags,
      productDetailsMap,
      scopeLabels
    );

    await insertDetailRecordsBatched(
      connection,
      verificationId,
      records,
      'MISSING'
    );

    if (tags.length < MISSING_FETCH_SIZE) {
      break;
    }

    lastTag = tags[tags.length - 1];
  }
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
    throw new ApiError(400, 'No active product batch found. Upload inventory first.');
  }

  const scope = buildInventoryScopeFilter(
    activeBatchId,
    product,
    subProduct,
    center
  );

  const { total: totalExpected, sql: countSql } = await countExpectedTags(scope);
  const sampleTags = await sampleExpectedTags(scope);

  logVerificationDebug('scope', {
    allProductsScope,
    activeBatchId,
    whereClause: scope.whereClause,
    params: scope.params,
    countSql,
    totalExpected,
    sampleExpectedTags: sampleTags,
  });

  if (totalExpected === 0) {
    throw new ApiError(400, 'No inventory tags found for the selected scope.');
  }

  const scopeLabels = resolveStoredScope(product, subProduct, center);

  const scannedTags = normalizeScannedTags(tagData);

  const found = await findScannedTagsInScope(scope, scannedTags);
  const foundSet = new Set(found);
  const newTags = scannedTags.filter((tag) => !foundSet.has(tag));
  const missingCount = totalExpected - found.length;

  logVerificationDebug('classification', {
    scannedTags,
    found,
    newTags,
    missingCount,
  });

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [headerResult] = await connection.execute(
      `INSERT INTO stock_verification
        (verification_date, verification_millis, product_name, sub_product_name,
         center_name, total_expected, total_scanned, found_count, missing_count, new_count)
       VALUES (FROM_UNIXTIME(?), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        resolveVerificationEpochSeconds(datetimeMillis),
        datetimeMillis,
        scopeLabels.productName,
        scopeLabels.subProductName,
        scopeLabels.centerName,
        totalExpected,
        scannedTags.length,
        found.length,
        missingCount,
        newTags.length,
      ]
    );

    const verificationId = headerResult.insertId;

    const foundProductDetails = await fetchProductDetailsByTags(
      connection,
      found,
      activeBatchId
    );

    logVerificationDebug('found-product-details', {
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
      scopeLabels
    );

    await insertDetailRecordsBatched(
      connection,
      verificationId,
      foundRecords,
      'FOUND'
    );

    await insertMissingDetails(
      connection,
      scope,
      scannedTags,
      verificationId,
      scopeLabels,
      activeBatchId
    );

    const newRecords = buildNewDetailRecords(newTags, scopeLabels);

    await insertDetailRecordsBatched(
      connection,
      verificationId,
      newRecords,
      'NEW'
    );

    await connection.commit();

    return {
      verificationId,
      batchId: activeBatchId,
      totalExpected,
      totalScanned: scannedTags.length,
      foundCount: found.length,
      missingCount,
      newCount: newTags.length,
    };
  } catch (error) {
    await connection.rollback();
    console.error('Stock verification upload failed:', error);
    throw error;
  } finally {
    connection.release();
  }
};

export default {
  uploadStockVerification,
};
