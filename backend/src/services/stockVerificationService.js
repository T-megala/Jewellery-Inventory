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
const DEBUG = process.env.STOCK_VERIFICATION_DEBUG === 'true';

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

const insertDetailRecords = async (
  connection,
  verificationId,
  tags,
  status,
  productName,
  subProductName,
  centerName
) => {
  if (tags.length === 0) {
    return;
  }

  const placeholders = tags.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
  const values = tags.flatMap((tag) => [
    verificationId,
    tag,
    status,
    productName,
    subProductName,
    centerName,
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
  tags,
  status,
  productName,
  subProductName,
  centerName
) => {
  for (let index = 0; index < tags.length; index += DETAIL_BATCH_SIZE) {
    const chunk = tags.slice(index, index + DETAIL_BATCH_SIZE);
    await insertDetailRecords(
      connection,
      verificationId,
      chunk,
      status,
      productName,
      subProductName,
      centerName
    );
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

const insertMissingDetails = async (
  connection,
  scope,
  scannedTags,
  verificationId,
  productName,
  subProductName,
  centerName
) => {
  const notInClause =
    scannedTags.length > 0
      ? `AND ${TAG_EXPR} NOT IN (${scannedTags.map(() => '?').join(', ')})`
      : '';
  const baseParams =
    scannedTags.length > 0 ? [...scope.params, ...scannedTags] : scope.params;

  let offset = 0;

  while (true) {
    const [rows] = await connection.execute(
      `SELECT DISTINCT ${TAG_EXPR} AS tag
       FROM products
       WHERE ${scope.whereClause}
         ${notInClause}
       ORDER BY tag
       LIMIT ${MISSING_FETCH_SIZE} OFFSET ${offset}`,
      baseParams
    );

    if (rows.length === 0) {
      break;
    }

    const tags = rows.map((row) => normalizeTag(row.tag));
    await insertDetailRecordsBatched(
      connection,
      verificationId,
      tags,
      'MISSING',
      productName,
      subProductName,
      centerName
    );

    offset += rows.length;

    if (rows.length < MISSING_FETCH_SIZE) {
      break;
    }
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

  const { productName, subProductName, centerName } = resolveStoredScope(
    product,
    subProduct,
    center
  );

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
        datetimeMillis / 1000,
        datetimeMillis,
        productName,
        subProductName,
        centerName,
        totalExpected,
        scannedTags.length,
        found.length,
        missingCount,
        newTags.length,
      ]
    );

    const verificationId = headerResult.insertId;

    await insertDetailRecordsBatched(
      connection,
      verificationId,
      found,
      'FOUND',
      productName,
      subProductName,
      centerName
    );

    await insertMissingDetails(
      connection,
      scope,
      scannedTags,
      verificationId,
      productName,
      subProductName,
      centerName
    );

    await insertDetailRecordsBatched(
      connection,
      verificationId,
      newTags,
      'NEW',
      productName,
      subProductName,
      centerName
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
