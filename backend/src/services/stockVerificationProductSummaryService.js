import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";
import { buildVerificationDayFilterClause } from "../utils/verificationScope.js";
import { rebuildProductSummary, refreshSessionProductAggregates } from "./verificationProductSummary.js";

const VALID_PRODUCT_STATUSES = [
  "FULLY_VERIFIED",
  "PARTIALLY_VERIFIED",
  "NOT_VERIFIED",
  "NEW",
];

const resolveVerificationSession = async (filters) => {
  const { whereClause, params } = buildVerificationDayFilterClause(filters);

  const [rows] = await pool.execute(
    `SELECT sv.id, sv.batch_id
     FROM stock_verification sv
     WHERE ${whereClause}
     ORDER BY sv.verification_date DESC, sv.id DESC
     LIMIT 1`,
    params,
  );

  return rows[0] ?? null;
};

const ensureProductSummaryReady = async (verificationId, batchId) => {
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM stock_verification_product_summary
     WHERE verification_id = ?`,
    [verificationId],
  );

  if (Number(row?.total ?? 0) > 0) {
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await rebuildProductSummary(connection, verificationId, batchId);

    const [[sessionRow]] = await connection.execute(
      `SELECT total_expected, found_count, missing_count, new_count
       FROM stock_verification
       WHERE id = ?`,
      [verificationId],
    );

    await refreshSessionProductAggregates(connection, verificationId, batchId, {
      totalExpectedTags: Number(sessionRow?.total_expected ?? 0),
      totalFoundTags: Number(sessionRow?.found_count ?? 0),
      totalMissingTags: Number(sessionRow?.missing_count ?? 0),
      totalNewTags: Number(sessionRow?.new_count ?? 0),
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const mapSummaryRow = (row) => ({
  totalProducts: Number(row.total_products ?? 0),
  fullyVerifiedProducts: Number(row.fully_verified_products ?? 0),
  partiallyVerifiedProducts: Number(row.partially_verified_products ?? 0),
  notVerifiedProducts: Number(row.not_verified_products ?? 0),
  totalExpectedTags: Number(row.total_expected ?? 0),
  totalFoundTags: Number(row.found_count ?? 0),
  totalMissingTags: Number(row.missing_count ?? 0),
  totalNewTags: Number(row.new_count ?? 0),
  overallVerificationPercentage: Number(row.overall_verification_percentage ?? 0),
});

const buildProductDataFilterClause = (filters) => {
  const conditions = ["svps.verification_id = ?"];
  const params = [];

  if (
    filters.verificationStatus &&
    filters.verificationStatus !== "NEW"
  ) {
    conditions.push("AND svps.verification_status = ?");
    params.push(filters.verificationStatus);
  }

  if (filters.search) {
    conditions.push(
      "AND (svps.item_description LIKE ? OR svps.barcode LIKE ?)",
    );
    const term = `%${filters.search}%`;
    params.push(term, term);
  }

  return { whereClause: conditions.join(" "), params };
};

const buildNewTagsFilterClause = (filters) => {
  const conditions = ["svd.verification_id = ?", "AND svd.status = 'NEW'"];
  const params = [];

  if (filters.search) {
    conditions.push(
      "AND (svd.tag_no LIKE ? OR svd.item_description LIKE ?)",
    );
    const term = `%${filters.search}%`;
    params.push(term, term);
  }

  return { whereClause: conditions.join(" "), params };
};

const buildCombinedProductQuery = (filters, verificationId) => {
  const includeInventory =
    !filters.verificationStatus || filters.verificationStatus !== "NEW";
  const includeNew =
    !filters.verificationStatus || filters.verificationStatus === "NEW";

  const parts = [];
  const params = [];

  if (includeInventory) {
    const { whereClause, params: inventoryParams } =
      buildProductDataFilterClause(filters);

    parts.push(
      `SELECT
         svps.product_id,
         svps.barcode,
         svps.item_description,
         svps.expected_qty,
         svps.found_qty,
         svps.missing_qty,
         svps.verification_percentage,
         svps.verification_status
       FROM stock_verification_product_summary svps
       WHERE ${whereClause}`,
    );
    params.push(verificationId, ...inventoryParams);
  }

  if (includeNew) {
    const { whereClause, params: newParams } =
      buildNewTagsFilterClause(filters);

    parts.push(
      `SELECT
         NULL AS product_id,
         svd.tag_no AS barcode,
         COALESCE(MAX(svd.item_description), svd.tag_no) AS item_description,
         0 AS expected_qty,
         COALESCE(SUM(svd.scanned_qty), 0) AS found_qty,
         0 AS missing_qty,
         0 AS verification_percentage,
         'NEW' AS verification_status
       FROM stock_verification_details svd
       WHERE ${whereClause}
       GROUP BY svd.tag_no`,
    );
    params.push(verificationId, ...newParams);
  }

  if (parts.length === 0) {
    return { fromSql: null, params: [] };
  }

  return {
    fromSql: `(${parts.join(" UNION ALL ")}) combined`,
    params,
  };
};

const COMBINED_ORDER_SQL = `
  ORDER BY
    FIELD(
      combined.verification_status,
      'FULLY_VERIFIED',
      'PARTIALLY_VERIFIED',
      'NOT_VERIFIED',
      'NEW'
    ),
    combined.verification_percentage DESC,
    combined.item_description ASC,
    combined.barcode ASC
`;

const mapProductRow = (row) => ({
  productId: row.product_id == null ? null : Number(row.product_id),
  productName: row.item_description,
  barcode: row.barcode,
  expectedQty: Number(row.expected_qty ?? 0),
  foundQty: Number(row.found_qty ?? 0),
  missingQty: Number(row.missing_qty ?? 0),
  verificationPercentage: Number(row.verification_percentage ?? 0),
  verificationStatus: row.verification_status,
});

const getProductSummary = async (filters, pagination) => {
  const session = await resolveVerificationSession(filters);

  if (!session) {
    return {
      verificationId: null,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        totalRecords: 0,
        totalPages: 0,
      },
      summary: {
        tagCounts: {
          foundCount: 0,
          missingCount: 0,
          newCount: 0,
        },
        productCounts: {
          totalProducts: 0,
          fullyVerifiedProducts: 0,
          partiallyVerifiedProducts: 0,
          notVerifiedProducts: 0,
          newProducts: 0,
        },
        totalExpectedTags: 0,
        totalFoundTags: 0,
        totalMissingTags: 0,
        totalNewTags: 0,
        overallVerificationPercentage: 0,
      },
      data: [],
    };
  }

  await ensureProductSummaryReady(session.id, session.batch_id);

  const { whereClause: verificationWhere, params: verificationParams } =
    buildVerificationDayFilterClause(filters);

  const [summaryRows] = await pool.execute(
    `SELECT
       sv.id AS verification_id,
       sv.total_products,
       sv.fully_verified_products,
       sv.partially_verified_products,
       sv.not_verified_products,
       sv.total_expected,
       sv.found_count,
       sv.missing_count,
       sv.new_count,
       sv.overall_verification_percentage
     FROM stock_verification sv
     WHERE ${verificationWhere}`,
    verificationParams,
  );

  const summaryRow = summaryRows[0] ?? {};
  const metrics = mapSummaryRow(summaryRow);
  const { fromSql, params: combinedParams } = buildCombinedProductQuery(
    filters,
    session.id,
  );

  if (!fromSql) {
    return {
      verificationId: Number(summaryRow.verification_id ?? session.id),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        totalRecords: 0,
        totalPages: 0,
      },
      summary: {
        tagCounts: {
          foundCount: metrics.totalFoundTags,
          missingCount: metrics.totalMissingTags,
          newCount: metrics.totalNewTags,
        },
        productCounts: {
          totalProducts: metrics.totalProducts,
          fullyVerifiedProducts: metrics.fullyVerifiedProducts,
          partiallyVerifiedProducts: metrics.partiallyVerifiedProducts,
          notVerifiedProducts: metrics.notVerifiedProducts,
          newProducts: metrics.totalNewTags,
        },
        totalExpectedTags: metrics.totalExpectedTags,
        totalFoundTags: metrics.totalFoundTags,
        totalMissingTags: metrics.totalMissingTags,
        totalNewTags: metrics.totalNewTags,
        overallVerificationPercentage: metrics.overallVerificationPercentage,
      },
      data: [],
    };
  }

  const [[countRow]] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM ${fromSql}`,
    combinedParams,
  );

  const totalRecords = Number(countRow?.total ?? 0);
  const totalPages =
    totalRecords === 0 ? 0 : Math.ceil(totalRecords / pagination.limit);

  const [dataRows] = await pool.execute(
    `SELECT
       combined.product_id,
       combined.barcode,
       combined.item_description,
       combined.expected_qty,
       combined.found_qty,
       combined.missing_qty,
       combined.verification_percentage,
       combined.verification_status
     FROM ${fromSql}
     ${COMBINED_ORDER_SQL}
     LIMIT ${pagination.limit} OFFSET ${pagination.offset}`,
    combinedParams,
  );

  const [[newProductRow]] = await pool.execute(
    `SELECT COUNT(DISTINCT svd.tag_no) AS total
     FROM stock_verification_details svd
     WHERE svd.verification_id = ?
       AND svd.status = 'NEW'`,
    [session.id],
  );

  const newProducts = Number(newProductRow?.total ?? 0);

  return {
    verificationId: Number(summaryRow.verification_id ?? session.id),
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      totalRecords,
      totalPages,
    },
    summary: {
      tagCounts: {
        foundCount: metrics.totalFoundTags,
        missingCount: metrics.totalMissingTags,
        newCount: metrics.totalNewTags,
      },
      productCounts: {
        totalProducts: metrics.totalProducts,
        fullyVerifiedProducts: metrics.fullyVerifiedProducts,
        partiallyVerifiedProducts: metrics.partiallyVerifiedProducts,
        notVerifiedProducts: metrics.notVerifiedProducts,
        newProducts,
      },
      totalExpectedTags: metrics.totalExpectedTags,
      totalFoundTags: metrics.totalFoundTags,
      totalMissingTags: metrics.totalMissingTags,
      totalNewTags: metrics.totalNewTags,
      overallVerificationPercentage: metrics.overallVerificationPercentage,
    },
    data: dataRows.map(mapProductRow),
  };
};

export default {
  getProductSummary,
  VALID_PRODUCT_STATUSES,
};
