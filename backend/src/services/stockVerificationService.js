import pool from '../config/database.js';
import { getActiveBatchId } from '../services/productBatchService.js';
import ApiError from '../utils/ApiError.js';

const categorizeTags = (expectedTags, scannedTags) => {
  const expectedSet = new Set(expectedTags);
  const scannedSet = new Set(scannedTags);

  const found = expectedTags.filter((tag) => scannedSet.has(tag));
  const missing = expectedTags.filter((tag) => !scannedSet.has(tag));
  const newTags = scannedTags.filter((tag) => !expectedSet.has(tag));

  return { found, missing, newTags };
};

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

const uploadStockVerification = async ({
  datetimeMillis,
  productName,
  subProductName,
  centerName,
  tagData,
}) => {
  const activeBatchId = await getActiveBatchId();

  if (!activeBatchId) {
    throw new ApiError(400, 'No active product batch found. Upload inventory first.');
  }

  const [rows] = await pool.execute(
    `SELECT tag_packet_no
     FROM products
     WHERE batch_id = ?
       AND product = ?
       AND sub_product = ?
       AND counter_name = ?
       AND tag_packet_no IS NOT NULL
       AND TRIM(tag_packet_no) != ''`,
    [activeBatchId, productName, subProductName, centerName]
  );

  const expectedTags = [
    ...new Set(
      rows.map((row) => String(row.tag_packet_no).trim()).filter(Boolean)
    ),
  ];

  const scannedTags = [
    ...new Set(tagData.map((tag) => String(tag).trim()).filter(Boolean)),
  ];

  const { found, missing, newTags } = categorizeTags(expectedTags, scannedTags);

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
        expectedTags.length,
        scannedTags.length,
        found.length,
        missing.length,
        newTags.length,
      ]
    );

    const verificationId = headerResult.insertId;

    await insertDetailRecords(
      connection,
      verificationId,
      found,
      'FOUND',
      productName,
      subProductName,
      centerName
    );

    await insertDetailRecords(
      connection,
      verificationId,
      missing,
      'MISSING',
      productName,
      subProductName,
      centerName
    );

    await insertDetailRecords(
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
      totalExpected: expectedTags.length,
      totalScanned: scannedTags.length,
      foundCount: found.length,
      missingCount: missing.length,
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
