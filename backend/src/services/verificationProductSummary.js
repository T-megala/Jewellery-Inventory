import { TAG_EXPR, tagNoEqualsBarcodeExpr } from "../utils/verificationScope.js";

const SUMMARY_BATCH_SIZE = 1000;

export const classifyVerificationStatus = (
  expectedQty,
  foundQty,
  missingQty,
) => {
  const expected = Number(expectedQty ?? 0);
  const found = Number(foundQty ?? 0);
  const missing = Number(missingQty ?? 0);

  if (found === expected && missing === 0) {
    return "FULLY_VERIFIED";
  }

  if (found > 0 && missing > 0) {
    return "PARTIALLY_VERIFIED";
  }

  if (found === 0 && missing === expected) {
    return "NOT_VERIFIED";
  }

  if (found > 0) {
    return "PARTIALLY_VERIFIED";
  }

  return "NOT_VERIFIED";
};

export const calculateVerificationPercentage = (expectedQty, foundQty) => {
  const expected = Number(expectedQty ?? 0);
  const found = Number(foundQty ?? 0);

  if (expected <= 0) {
    return found <= 0 ? 100 : 0;
  }

  return Math.round(Math.min((found / expected) * 100, 100) * 100) / 100;
};

const countProductSummaryRows = async (connection, verificationId) => {
  const [[row]] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM stock_verification_product_summary
     WHERE verification_id = ?`,
    [verificationId],
  );

  return Number(row?.total ?? 0);
};

export const initializeProductSummary = async (
  connection,
  verificationId,
  batchId,
) => {
  const existingCount = await countProductSummaryRows(
    connection,
    verificationId,
  );

  if (existingCount > 0) {
    return existingCount;
  }

  const [result] = await connection.execute(
    `INSERT INTO stock_verification_product_summary
      (verification_id, product_id, barcode, item_description,
       expected_qty, found_qty, missing_qty,
       verification_percentage, verification_status)
     SELECT
       ?,
       p.id,
       ${TAG_EXPR},
       p.item_description,
       p.closing_bal_qty,
       0,
       p.closing_bal_qty,
       0,
       'NOT_VERIFIED'
     FROM products p
     WHERE p.batch_id = ?
       AND p.barcode IS NOT NULL
       AND TRIM(p.barcode) != ''`,
    [verificationId, batchId],
  );

  return Number(result.affectedRows ?? 0);
};

export const refreshProductSummaryForTags = async (
  connection,
  verificationId,
  tags,
) => {
  if (tags.length === 0) {
    return;
  }

  for (let index = 0; index < tags.length; index += SUMMARY_BATCH_SIZE) {
    const chunk = tags.slice(index, index + SUMMARY_BATCH_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");

    await connection.execute(
      `UPDATE stock_verification_product_summary svps
       INNER JOIN (
         SELECT tag_no, COALESCE(SUM(found_qty), 0) AS found_qty
         FROM stock_verification_details
         WHERE verification_id = ?
           AND status = 'FOUND'
           AND tag_no IN (${placeholders})
         GROUP BY tag_no
       ) fd ON ${tagNoEqualsBarcodeExpr("fd.tag_no", "svps.barcode")}
       SET
         svps.found_qty = fd.found_qty,
         svps.missing_qty = GREATEST(svps.expected_qty - fd.found_qty, 0),
         svps.verification_percentage = CASE
           WHEN svps.expected_qty > 0
           THEN ROUND(LEAST(fd.found_qty / svps.expected_qty * 100, 100), 2)
           ELSE CASE WHEN fd.found_qty <= 0 THEN 100 ELSE 0 END
         END,
         svps.verification_status = CASE
           WHEN fd.found_qty >= svps.expected_qty
             AND svps.expected_qty > 0
           THEN 'FULLY_VERIFIED'
           WHEN fd.found_qty > 0
           THEN 'PARTIALLY_VERIFIED'
           ELSE 'NOT_VERIFIED'
         END
       WHERE svps.verification_id = ?`,
      [verificationId, ...chunk, verificationId],
    );
  }
};

export const rebuildProductSummary = async (
  connection,
  verificationId,
  batchId,
) => {
  await connection.execute(
    `DELETE FROM stock_verification_product_summary
     WHERE verification_id = ?`,
    [verificationId],
  );

  await connection.execute(
    `INSERT INTO stock_verification_product_summary
      (verification_id, product_id, barcode, item_description,
       expected_qty, found_qty, missing_qty,
       verification_percentage, verification_status)
     SELECT
       ?,
       p.id,
       ${TAG_EXPR},
       p.item_description,
       p.closing_bal_qty,
       COALESCE(fd.found_qty, 0),
       GREATEST(p.closing_bal_qty - COALESCE(fd.found_qty, 0), 0),
       CASE
         WHEN p.closing_bal_qty > 0
         THEN ROUND(
           LEAST(COALESCE(fd.found_qty, 0) / p.closing_bal_qty * 100, 100),
           2
         )
         ELSE CASE WHEN COALESCE(fd.found_qty, 0) <= 0 THEN 100 ELSE 0 END
       END,
       CASE
         WHEN COALESCE(fd.found_qty, 0) >= p.closing_bal_qty
           AND p.closing_bal_qty > 0
         THEN 'FULLY_VERIFIED'
         WHEN COALESCE(fd.found_qty, 0) > 0
         THEN 'PARTIALLY_VERIFIED'
         ELSE 'NOT_VERIFIED'
       END
     FROM products p
     LEFT JOIN (
       SELECT tag_no, COALESCE(SUM(found_qty), 0) AS found_qty
       FROM stock_verification_details
       WHERE verification_id = ?
         AND status = 'FOUND'
       GROUP BY tag_no
     ) fd ON ${tagNoEqualsBarcodeExpr("fd.tag_no", TAG_EXPR)}
     WHERE p.batch_id = ?
       AND p.barcode IS NOT NULL
       AND TRIM(p.barcode) != ''`,
    [verificationId, verificationId, batchId],
  );
};

export const getProductSummaryAggregates = async (
  connection,
  verificationId,
) => {
  const [[productCounts]] = await connection.execute(
    `SELECT
       COUNT(*) AS totalProducts,
       COALESCE(SUM(CASE WHEN verification_status = 'FULLY_VERIFIED' THEN 1 ELSE 0 END), 0)
         AS fullyVerifiedProducts,
       COALESCE(SUM(CASE WHEN verification_status = 'PARTIALLY_VERIFIED' THEN 1 ELSE 0 END), 0)
         AS partiallyVerifiedProducts,
       COALESCE(SUM(CASE WHEN verification_status = 'NOT_VERIFIED' THEN 1 ELSE 0 END), 0)
         AS notVerifiedProducts
     FROM stock_verification_product_summary
     WHERE verification_id = ?`,
    [verificationId],
  );

  return {
    totalProducts: Number(productCounts?.totalProducts ?? 0),
    fullyVerifiedProducts: Number(productCounts?.fullyVerifiedProducts ?? 0),
    partiallyVerifiedProducts: Number(
      productCounts?.partiallyVerifiedProducts ?? 0,
    ),
    notVerifiedProducts: Number(productCounts?.notVerifiedProducts ?? 0),
  };
};

export const refreshSessionProductAggregates = async (
  connection,
  verificationId,
  batchId,
  tagStats,
) => {
  const productCounts = await getProductSummaryAggregates(
    connection,
    verificationId,
  );

  const totalExpectedTags = Number(tagStats.totalExpectedTags ?? 0);
  const totalFoundTags = Number(tagStats.totalFoundTags ?? 0);
  const overallVerificationPercentage =
    totalExpectedTags > 0
      ? Math.round((totalFoundTags / totalExpectedTags) * 10000) / 100
      : 0;

  await connection.execute(
    `UPDATE stock_verification
     SET total_products = ?,
         fully_verified_products = ?,
         partially_verified_products = ?,
         not_verified_products = ?,
         overall_verification_percentage = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      productCounts.totalProducts,
      productCounts.fullyVerifiedProducts,
      productCounts.partiallyVerifiedProducts,
      productCounts.notVerifiedProducts,
      overallVerificationPercentage,
      verificationId,
    ],
  );

  return {
    productCounts,
    overallVerificationPercentage,
  };
};
