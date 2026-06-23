import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";
import { getActiveBatchId } from "./productBatchService.js";
import {
  buildExcelBuffer,
  buildPdfBuffer,
  getExportFileName,
} from "../utils/reportExport.js";
import {
  SCOPE_NAMES,
  formatNewScopeDisplayValue,
} from "../utils/verificationScope.js";

const VALID_STATUSES = ["FOUND", "MISSING", "NEW"];
const MAX_EXPORT_ROWS = 50000;

const LATEST_SCAN_SUBQUERY = `
  SELECT verification_id, MAX(id) AS latest_scan_id
  FROM latest_stock_verification
  GROUP BY verification_id
`;

const LATEST_SCAN_JOIN_SQL = `
  INNER JOIN (${LATEST_SCAN_SUBQUERY}) latest ON latest.verification_id = sv.id
`;

const ACTIVE_BATCH_FOR_BRANCH_SQL = `(
  SELECT id
  FROM product_upload_batches
  WHERE branch_id = sv.branch_id
    AND is_active = 1
  ORDER BY id DESC
  LIMIT 1
)`;

/**
 * Builds WHERE conditions for inventory scope matching.
 * Used to find expected tags that should be in the verification.
 */
const buildInventoryScopeConditions = () => `
  p.tag_packet_no IS NOT NULL
  AND TRIM(p.tag_packet_no) != ''
  AND (
    sv.product_name = '${SCOPE_NAMES.ALL_PRODUCTS}'
    OR (
      (p.batch_id = ${ACTIVE_BATCH_FOR_BRANCH_SQL} OR p.batch_id IS NULL)
      AND p.product = sv.product_name
      AND (
        sv.sub_product_name = '${SCOPE_NAMES.ALL_SUB_PRODUCTS}'
        OR p.sub_product = sv.sub_product_name
      )
      AND (
        sv.center_name = '${SCOPE_NAMES.ALL_CENTERS}'
        OR p.counter_name = sv.center_name
      )
    )
  )
`;

/**
 * Builds NOT EXISTS condition using latest_scan_id (indexed) instead of verification_id.
 */
const buildNotFoundCondition = () => `
  NOT EXISTS (
    SELECT 1
    FROM stock_verification_details svd_found
    WHERE svd_found.latest_scan_id = lsv.id
      AND svd_found.tag_no = UPPER(TRIM(p.tag_packet_no))
      AND svd_found.status = 'FOUND'
  )
`;

const logReport = (message, meta = undefined) => {
  if (meta === undefined) {
    console.info(`[stock-verification-report] ${message}`);
    return;
  }

  console.info(`[stock-verification-report] ${message}`, meta);
};

const formatDateTime = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
};

const toNumber = (value) =>
  value === null || value === undefined ? null : Number(value);

const buildBranchFilterClause = (filters) => {
  const branchIds = filters.branchIds ?? [];

  if (branchIds.length === 0) {
    return { clause: "AND 1 = 0", params: [] };
  }

  const placeholders = branchIds.map(() => "?").join(", ");

  return {
    clause: `AND sv.branch_id IN (${placeholders})`,
    params: branchIds,
  };
};

const buildDateFilterClause = (filters) => ({
  clause: "AND sv.verification_day = ?",
  params: [filters.date],
});

const DETAIL_FROM_SQL = `
  FROM stock_verification_details svd
  INNER JOIN stock_verification sv ON sv.id = svd.verification_id
  LEFT JOIN branches b ON b.id = sv.branch_id
  ${LATEST_SCAN_JOIN_SQL}
`;

const PRODUCT_JOIN_SQL = `
  LEFT JOIN products p ON
    p.batch_id = ${ACTIVE_BATCH_FOR_BRANCH_SQL}
    AND p.tag_packet_no = svd.tag_no
`;

const PRODUCT_SELECT_SQL = `
  p.id AS product_id,
  p.tran_no AS product_tran_no,
  p.tran_date AS product_tran_date,
  p.product AS inventory_product,
  p.sub_product AS inventory_sub_product,
  p.tag_packet_no AS inventory_tag_packet_no,
  p.pieces AS product_pieces,
  p.gross_wt AS product_gross_wt,
  p.net_wt AS product_net_wt,
  p.counter_name AS product_counter_name,
  p.size AS product_size,
  p.tag_type AS product_tag_type,
  p.item_pieces AS product_item_pieces,
  p.weight_gram AS product_weight_gram,
  p.weight_carat AS product_weight_carat,
  p.created_at AS product_created_at
`;

const EXCEL_PRODUCT_SELECT_SQL = `
  p.tran_no AS product_tran_no,
  p.tran_date AS product_tran_date,
  p.pieces AS product_pieces,
  p.gross_wt AS product_gross_wt,
  p.net_wt AS product_net_wt,
  p.counter_name AS product_counter_name,
  p.size AS product_size,
  p.tag_type AS product_tag_type,
  p.item_pieces AS product_item_pieces,
  p.weight_gram AS product_weight_gram,
  p.weight_carat AS product_weight_carat
`;


const DETAIL_SELECT_SQL = `
  SELECT svd.id, svd.verification_id, sv.verification_date,
         sv.branch_id, b.name AS branch_name,
         svd.product_name, svd.sub_product_name, svd.center_name,
         svd.tag_no, svd.status, svd.created_at
`;

const EXCEL_DETAIL_SELECT_SQL = `
  SELECT sv.verification_date,
         svd.product_name, svd.sub_product_name, svd.center_name,
         svd.tag_no, svd.status
`;

const STORED_REPORT_ORDER_SQL = `
  ORDER BY
    FIELD(svd.status, 'FOUND', 'NEW'),
    sv.verification_date DESC,
    svd.id DESC
`;

const buildHeaderFilterClause = (filters) => {
  const conditions = ["1 = 1"];
  const params = [];
  const branchFilter = buildBranchFilterClause(filters);
  const dateFilter = buildDateFilterClause(filters);

  if (filters.productName) {
    conditions.push("AND sv.product_name = ?");
    params.push(filters.productName);
  }
  if (filters.subProductName) {
    conditions.push("AND sv.sub_product_name = ?");
    params.push(filters.subProductName);
  }
  if (filters.centerName) {
    conditions.push("AND sv.center_name = ?");
    params.push(filters.centerName);
  }
  if (branchFilter.clause) {
    conditions.push(branchFilter.clause);
    params.push(...branchFilter.params);
  }
  if (dateFilter.clause) {
    conditions.push(dateFilter.clause);
    params.push(...dateFilter.params);
  }

  return { whereClause: conditions.join(" "), params };
};

const buildStoredDetailFilterClause = (filters, { includeStatus = true } = {}) => {
  const conditions = ["svd.latest_scan_id = latest.latest_scan_id"];
  const params = [];
  const branchFilter = buildBranchFilterClause(filters);
  const dateFilter = buildDateFilterClause(filters);

  if (filters.productName) {
    conditions.push("AND svd.product_name = ?");
    params.push(filters.productName);
  }
  if (filters.subProductName) {
    conditions.push("AND svd.sub_product_name = ?");
    params.push(filters.subProductName);
  }
  if (filters.centerName) {
    conditions.push("AND svd.center_name = ?");
    params.push(filters.centerName);
  }
  if (includeStatus) {
    if (filters.status === "FOUND" || filters.status === "NEW") {
      conditions.push("AND svd.status = ?");
      params.push(filters.status);
    } else {
      conditions.push("AND svd.status IN ('FOUND', 'NEW')");
    }
  }
  if (branchFilter.clause) {
    conditions.push(branchFilter.clause);
    params.push(...branchFilter.params);
  }
  if (dateFilter.clause) {
    conditions.push(dateFilter.clause);
    params.push(...dateFilter.params);
  }

  return { whereClause: conditions.join(" "), params };
};

const buildStoredDetailQuery = (filters) => {
  const { whereClause, params } = buildStoredDetailFilterClause(filters);

  return {
    baseFrom: `
      ${DETAIL_FROM_SQL}
      WHERE ${whereClause}
    `,
    params,
  };
};

const buildExportQuery = (filters) => {
  const { whereClause, params } = buildStoredDetailFilterClause(filters);

  return {
    baseFrom: `
      ${DETAIL_FROM_SQL}
      ${PRODUCT_JOIN_SQL}
      WHERE ${whereClause}
    `,
    params,
  };
};

const getStoredRecordCount = (summary, filters) => {
  if (filters.status === "FOUND") {
    return summary.foundCount;
  }

  if (filters.status === "NEW") {
    return summary.newCount;
  }

  return summary.foundCount + summary.newCount;
};

const mapProductRow = (row) => ({
  product_id: row.id ?? row.product_id,
  product_tran_no: row.tran_no ?? row.product_tran_no,
  product_tran_date: row.tran_date ?? row.product_tran_date,
  inventory_product: row.product ?? row.inventory_product,
  inventory_sub_product: row.sub_product ?? row.inventory_sub_product,
  inventory_tag_packet_no: row.tag_packet_no ?? row.inventory_tag_packet_no,
  product_pieces: row.pieces ?? row.product_pieces,
  product_gross_wt: row.gross_wt ?? row.product_gross_wt,
  product_net_wt: row.net_wt ?? row.product_net_wt,
  product_counter_name: row.counter_name ?? row.product_counter_name,
  product_size: row.size ?? row.product_size,
  product_tag_type: row.tag_type ?? row.product_tag_type,
  product_item_pieces: row.item_pieces ?? row.product_item_pieces,
  product_weight_gram: row.weight_gram ?? row.product_weight_gram,
  product_weight_carat: row.weight_carat ?? row.product_weight_carat,
  product_created_at: row.created_at ?? row.product_created_at,
});

const enrichRowsWithProducts = async (rows) => {
  if (rows.length === 0) {
    return rows;
  }

  const needsEnrichment = rows.filter((row) => !row.product_id);
  if (needsEnrichment.length === 0) {
    return rows;
  }

  const tagsByBranch = new Map();

  for (const row of needsEnrichment) {
    const branchId = Number(row.branch_id);
    const tag = String(row.tag_no ?? "").trim().toUpperCase();

    if (!Number.isInteger(branchId) || branchId < 1 || !tag) {
      continue;
    }

    if (!tagsByBranch.has(branchId)) {
      tagsByBranch.set(branchId, new Set());
    }

    tagsByBranch.get(branchId).add(tag);
  }

  const productByBranchTag = new Map();

  for (const [branchId, tagSet] of tagsByBranch.entries()) {
    const tags = [...tagSet];
    const activeBatchId = await getActiveBatchId(branchId);

    if (!activeBatchId || tags.length === 0) {
      continue;
    }

    const placeholders = tags.map(() => "?").join(", ");
    const [productRows] = await pool.execute(
      `SELECT id, tran_no, tran_date, product, sub_product, tag_packet_no,
              pieces, gross_wt, net_wt, counter_name, size, tag_type,
              item_pieces, weight_gram, weight_carat, created_at
       FROM products
       WHERE batch_id = ?
         AND UPPER(TRIM(tag_packet_no)) IN (${placeholders})`,
      [activeBatchId, ...tags],
    );

    for (const product of productRows) {
      const key = `${branchId}:${String(product.tag_packet_no ?? "").trim().toUpperCase()}`;
      productByBranchTag.set(key, product);
    }
  }

  return rows.map((row) => {
    const branchId = Number(row.branch_id);
    const key = `${branchId}:${String(row.tag_no ?? "").trim().toUpperCase()}`;
    const product = productByBranchTag.get(key);

    if (!product) {
      return row;
    }

    return {
      ...row,
      ...mapProductRow(product),
    };
  });
};

const mapProductFields = (row) => ({
  productId: row.product_id ? Number(row.product_id) : null,
  tranNo: row.product_tran_no ?? null,
  tranDate: formatDate(row.product_tran_date),
  pieces: toNumber(row.product_pieces),
  grossWt: toNumber(row.product_gross_wt),
  netWt: toNumber(row.product_net_wt),
  inventoryCounterName: row.product_counter_name ?? null,
  size: row.product_size ?? null,
  tagType: row.product_tag_type ?? null,
  itemPieces: toNumber(row.product_item_pieces),
  weightGram: toNumber(row.product_weight_gram),
  weightCarat: toNumber(row.product_weight_carat),
  inventoryProduct: row.inventory_product ?? null,
  inventorySubProduct: row.inventory_sub_product ?? null,
  inventoryTagPacketNo: row.inventory_tag_packet_no ?? null,
  productCreatedAt: formatDateTime(row.product_created_at),
});

const resolveDisplayScopeFields = (row) => {
  if (row.status === "NEW") {
    return {
      productName: formatNewScopeDisplayValue(row.product_name),
      subProductName: formatNewScopeDisplayValue(row.sub_product_name),
      centerName: formatNewScopeDisplayValue(row.center_name),
    };
  }

  return {
    productName: row.inventory_product ?? row.product_name,
    subProductName: row.inventory_sub_product ?? row.sub_product_name,
    centerName: row.product_counter_name ?? row.center_name,
  };
};

const mapExcelRow = (row) => {
  const scopeFields = resolveDisplayScopeFields(row);

  return {
    verificationDate: formatDateTime(row.verification_date),
    branch: mapBranchFields(row),
    productName: scopeFields.productName,
    subProductName: scopeFields.subProductName,
    centerName: scopeFields.centerName,
    tagNo: row.tag_no,
    status: row.status,
    pieces: toNumber(row.product_pieces),
    tranNo: row.product_tran_no ?? null,
    tranDate: formatDate(row.product_tran_date),
    grossWt: toNumber(row.product_gross_wt),
    netWt: toNumber(row.product_net_wt),
    inventoryCounterName: row.product_counter_name ?? null,
    size: row.product_size ?? null,
    tagType: row.product_tag_type ?? null,
    itemPieces: toNumber(row.product_item_pieces),
    weightGram: toNumber(row.product_weight_gram),
    weightCarat: toNumber(row.product_weight_carat),
  };
};

const mapBranchFields = (row) =>
  row.branch_id
    ? {
        id: Number(row.branch_id),
        name: row.branch_name ?? null,
      }
    : null;

const mapRow = (row) => {
  const productFields = mapProductFields(row);
  const scopeFields = resolveDisplayScopeFields(row);

  return {
    id: row.id ?? null,
    verificationId: row.verification_id,
    verificationDate: formatDateTime(row.verification_date),
    branch: mapBranchFields(row),
    productName: scopeFields.productName,
    subProductName: scopeFields.subProductName,
    centerName: scopeFields.centerName,
    tagNo: row.tag_no,
    status: row.status,
    pieces: productFields.pieces,
    createdAt: formatDateTime(row.created_at),
    product: row.product_id ? productFields : null,
    ...productFields,
  };
};

const getHeaderSummary = async (filters) => {
  const { whereClause, params } = buildHeaderFilterClause(filters);
  const [summaryRows] = await pool.execute(
    `SELECT
       COALESCE(SUM(sv.found_count), 0) AS foundCount,
       COALESCE(SUM(sv.missing_count), 0) AS missingCount,
       COALESCE(SUM(sv.new_count), 0) AS newCount,
       COALESCE(SUM(sv.found_count + sv.missing_count + sv.new_count), 0) AS totalRecords
     FROM stock_verification sv
     WHERE ${whereClause}`,
    params,
  );

  return {
    foundCount: Number(summaryRows[0].foundCount ?? 0),
    missingCount: Number(summaryRows[0].missingCount ?? 0),
    newCount: Number(summaryRows[0].newCount ?? 0),
    totalRecords: Number(summaryRows[0].totalRecords ?? 0),
  };
};

const buildMissingRankedFromSql = (headerWhereClause) => {
  const inventoryScopeConditions = buildInventoryScopeConditions();
  const notFoundCondition = buildNotFoundCondition();

  return `
    FROM (
      SELECT
        NULL AS id,
        sv.id AS verification_id,
        sv.verification_date,
        sv.branch_id,
        b.name AS branch_name,
        p.product AS product_name,
        p.sub_product AS sub_product_name,
        COALESCE(NULLIF(TRIM(p.counter_name), ''), 'Unassigned') AS center_name,
        UPPER(TRIM(p.tag_packet_no)) AS tag_no,
        'MISSING' AS status,
        NULL AS created_at,
        p.id AS product_id,
        p.tran_no AS product_tran_no,
        p.tran_date AS product_tran_date,
        p.product AS inventory_product,
        p.sub_product AS inventory_sub_product,
        p.tag_packet_no AS inventory_tag_packet_no,
        p.pieces AS product_pieces,
        p.gross_wt AS product_gross_wt,
        p.net_wt AS product_net_wt,
        p.counter_name AS product_counter_name,
        p.size AS product_size,
        p.tag_type AS product_tag_type,
        p.item_pieces AS product_item_pieces,
        p.weight_gram AS product_weight_gram,
        p.weight_carat AS product_weight_carat,
        p.created_at AS product_created_at,
        ROW_NUMBER() OVER (
          PARTITION BY sv.id, UPPER(TRIM(p.tag_packet_no))
          ORDER BY
            CASE
              WHEN p.batch_id = ${ACTIVE_BATCH_FOR_BRANCH_SQL} THEN 0
              WHEN p.batch_id IS NULL THEN 1
              ELSE 2
            END,
            p.id DESC
        ) AS row_num
      FROM stock_verification sv
      INNER JOIN (${LATEST_SCAN_SUBQUERY}) latest ON latest.verification_id = sv.id
      INNER JOIN latest_stock_verification lsv ON lsv.id = latest.latest_scan_id
      LEFT JOIN branches b ON b.id = sv.branch_id
      INNER JOIN products p ON ${inventoryScopeConditions}
      WHERE ${notFoundCondition}
        AND ${headerWhereClause}
    ) missing_ranked
    WHERE missing_ranked.row_num = 1
  `;
};

const buildMissingQueryParts = (filters) => {
  const { whereClause, params } = buildHeaderFilterClause(filters);

  return {
    baseFrom: buildMissingRankedFromSql(whereClause),
    params,
  };
};

const getMissingRows = async (filters, pagination) => {
  const { baseFrom, params } = buildMissingQueryParts(filters);
  const { limit, offset } = pagination;

  const [dataRows] = await pool.execute(
    `SELECT
       missing_ranked.id,
       missing_ranked.verification_id,
       missing_ranked.verification_date,
       missing_ranked.branch_id,
       missing_ranked.branch_name,
       missing_ranked.product_name,
       missing_ranked.sub_product_name,
       missing_ranked.center_name,
       missing_ranked.tag_no,
       missing_ranked.status,
       missing_ranked.created_at,
       missing_ranked.product_id,
       missing_ranked.product_tran_no,
       missing_ranked.product_tran_date,
       missing_ranked.inventory_product,
       missing_ranked.inventory_sub_product,
       missing_ranked.inventory_tag_packet_no,
       missing_ranked.product_pieces,
       missing_ranked.product_gross_wt,
       missing_ranked.product_net_wt,
       missing_ranked.product_counter_name,
       missing_ranked.product_size,
       missing_ranked.product_tag_type,
       missing_ranked.product_item_pieces,
       missing_ranked.product_weight_gram,
       missing_ranked.product_weight_carat,
       missing_ranked.product_created_at
     ${baseFrom}
     ORDER BY missing_ranked.verification_date DESC, missing_ranked.tag_no ASC
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  return dataRows.map((row) => mapRow(row));
};

const getStoredDetailRows = async (filters, pagination) => {
  const { baseFrom, params } = buildStoredDetailQuery(filters);
  const { limit, offset } = pagination;

  const [dataRows] = await pool.execute(
    `${DETAIL_SELECT_SQL}
     ${baseFrom}
     ${STORED_REPORT_ORDER_SQL}
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  return dataRows;
};

/**
 * Fetches combined FOUND, NEW, and MISSING records in a single query.
 * Used when no status filter is provided, returning all three types together.
 */
const getCombinedRows = async (filters, pagination) => {
  const { limit, offset } = pagination;
  const { whereClause: headerWhereClause, params: headerParams } =
    buildHeaderFilterClause(filters);
  const { whereClause: detailWhereClause, params: detailParams } =
    buildStoredDetailFilterClause(filters, { includeStatus: false });

  const [dataRows] = await pool.execute(
    `SELECT combined_data.* FROM (
      -- FOUND records
      SELECT
        svd.id,
        svd.verification_id,
        sv.verification_date,
        sv.branch_id,
        b.name AS branch_name,
        svd.product_name,
        svd.sub_product_name,
        svd.center_name,
        svd.tag_no,
        svd.status,
        svd.created_at,
        p.id AS product_id,
        p.tran_no AS product_tran_no,
        p.tran_date AS product_tran_date,
        p.product AS inventory_product,
        p.sub_product AS inventory_sub_product,
        p.tag_packet_no AS inventory_tag_packet_no,
        p.pieces AS product_pieces,
        p.gross_wt AS product_gross_wt,
        p.net_wt AS product_net_wt,
        p.counter_name AS product_counter_name,
        p.size AS product_size,
        p.tag_type AS product_tag_type,
        p.item_pieces AS product_item_pieces,
        p.weight_gram AS product_weight_gram,
        p.weight_carat AS product_weight_carat,
        p.created_at AS product_created_at
      FROM stock_verification_details svd
      INNER JOIN stock_verification sv ON sv.id = svd.verification_id
      LEFT JOIN branches b ON b.id = sv.branch_id
      ${LATEST_SCAN_JOIN_SQL}
      LEFT JOIN products p ON p.batch_id = ${ACTIVE_BATCH_FOR_BRANCH_SQL}
        AND p.tag_packet_no = svd.tag_no
      WHERE svd.status = 'FOUND' AND ${detailWhereClause}

      UNION ALL

      -- NEW records
      SELECT
        svd.id,
        svd.verification_id,
        sv.verification_date,
        sv.branch_id,
        b.name AS branch_name,
        svd.product_name,
        svd.sub_product_name,
        svd.center_name,
        svd.tag_no,
        svd.status,
        svd.created_at,
        p.id AS product_id,
        p.tran_no AS product_tran_no,
        p.tran_date AS product_tran_date,
        p.product AS inventory_product,
        p.sub_product AS inventory_sub_product,
        p.tag_packet_no AS inventory_tag_packet_no,
        p.pieces AS product_pieces,
        p.gross_wt AS product_gross_wt,
        p.net_wt AS product_net_wt,
        p.counter_name AS product_counter_name,
        p.size AS product_size,
        p.tag_type AS product_tag_type,
        p.item_pieces AS product_item_pieces,
        p.weight_gram AS product_weight_gram,
        p.weight_carat AS product_weight_carat,
        p.created_at AS product_created_at
      FROM stock_verification_details svd
      INNER JOIN stock_verification sv ON sv.id = svd.verification_id
      LEFT JOIN branches b ON b.id = sv.branch_id
      ${LATEST_SCAN_JOIN_SQL}
      LEFT JOIN products p ON p.batch_id = ${ACTIVE_BATCH_FOR_BRANCH_SQL}
        AND p.tag_packet_no = svd.tag_no
      WHERE svd.status = 'NEW' AND ${detailWhereClause}

      UNION ALL

      -- MISSING records (dynamically generated with inventory product details)
      SELECT
        missing_ranked.id,
        missing_ranked.verification_id,
        missing_ranked.verification_date,
        missing_ranked.branch_id,
        missing_ranked.branch_name,
        missing_ranked.product_name,
        missing_ranked.sub_product_name,
        missing_ranked.center_name,
        missing_ranked.tag_no,
        missing_ranked.status,
        missing_ranked.created_at,
        missing_ranked.product_id,
        missing_ranked.product_tran_no,
        missing_ranked.product_tran_date,
        missing_ranked.inventory_product,
        missing_ranked.inventory_sub_product,
        missing_ranked.inventory_tag_packet_no,
        missing_ranked.product_pieces,
        missing_ranked.product_gross_wt,
        missing_ranked.product_net_wt,
        missing_ranked.product_counter_name,
        missing_ranked.product_size,
        missing_ranked.product_tag_type,
        missing_ranked.product_item_pieces,
        missing_ranked.product_weight_gram,
        missing_ranked.product_weight_carat,
        missing_ranked.product_created_at
      ${buildMissingRankedFromSql(headerWhereClause)}
    ) combined_data
    ORDER BY
      FIELD(combined_data.status, 'FOUND', 'NEW', 'MISSING'),
      combined_data.verification_date DESC,
      combined_data.tag_no ASC
    LIMIT ${limit} OFFSET ${offset}`,
    [...detailParams, ...detailParams, ...headerParams],
  );

  return dataRows;
};

const getReport = async (filters, pagination) => {
  const { page, limit } = pagination;
  const summary = await getHeaderSummary(filters);

  // If specific status requested, fetch only that status
  if (filters.status === "MISSING") {
    const totalRecords = summary.missingCount;
    const totalPages = totalRecords === 0 ? 0 : Math.ceil(totalRecords / limit);
    const data = await getMissingRows(filters, pagination);

    return {
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages,
      },
      summary: {
        foundCount: summary.foundCount,
        missingCount: summary.missingCount,
        newCount: summary.newCount,
      },
      data,
    };
  }

  if (filters.status === "FOUND" || filters.status === "NEW") {
    const totalRecords = getStoredRecordCount(summary, filters);
    const totalPages = totalRecords === 0 ? 0 : Math.ceil(totalRecords / limit);
    const dataRows = await getStoredDetailRows(filters, pagination);
    const enrichedRows = await enrichRowsWithProducts(dataRows);

    return {
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages,
      },
      summary: {
        foundCount: summary.foundCount,
        missingCount: summary.missingCount,
        newCount: summary.newCount,
      },
      data: enrichedRows.map(mapRow),
    };
  }

  // If no status filter, return combined FOUND + NEW + MISSING
  const totalRecords = summary.foundCount + summary.newCount + summary.missingCount;
  const totalPages = totalRecords === 0 ? 0 : Math.ceil(totalRecords / limit);
  const dataRows = await getCombinedRows(filters, pagination);
  const enrichedRows = await enrichRowsWithProducts(dataRows);

  return {
    pagination: {
      page,
      limit,
      totalRecords,
      totalPages,
    },
    summary: {
      foundCount: summary.foundCount,
      missingCount: summary.missingCount,
      newCount: summary.newCount,
    },
    data: enrichedRows.map(mapRow),
  };
};

const getAllStoredReportRows = async (filters) => {
  const summary = await getHeaderSummary(filters);
  const exportableCount = getStoredRecordCount(summary, filters);

  if (exportableCount > MAX_EXPORT_ROWS) {
    throw new ApiError(
      400,
      `Export limit exceeded. Narrow filters to ${MAX_EXPORT_ROWS} records or fewer.`,
    );
  }

  const { baseFrom, params } = buildExportQuery(filters);

  const [dataRows] = await pool.execute(
    `${DETAIL_SELECT_SQL},
            ${PRODUCT_SELECT_SQL}
     ${baseFrom}
     ${STORED_REPORT_ORDER_SQL}`,
    params,
  );

  return {
    summary: {
      foundCount: summary.foundCount,
      missingCount: summary.missingCount,
      newCount: summary.newCount,
    },
    data: dataRows.map(mapRow),
  };
};

const getAllMissingReportRows = async (filters) => {
  const summary = await getHeaderSummary(filters);

  if (summary.missingCount > MAX_EXPORT_ROWS) {
    throw new ApiError(
      400,
      `Export limit exceeded. Narrow filters to ${MAX_EXPORT_ROWS} records or fewer.`,
    );
  }

  const { baseFrom, params } = buildMissingQueryParts(filters);

  const [dataRows] = await pool.execute(
    `SELECT
       missing_ranked.id,
       missing_ranked.verification_id,
       missing_ranked.verification_date,
       missing_ranked.branch_id,
       missing_ranked.branch_name,
       missing_ranked.product_name,
       missing_ranked.sub_product_name,
       missing_ranked.center_name,
       missing_ranked.tag_no,
       missing_ranked.status,
       missing_ranked.created_at,
       missing_ranked.product_id,
       missing_ranked.product_tran_no,
       missing_ranked.product_tran_date,
       missing_ranked.inventory_product,
       missing_ranked.inventory_sub_product,
       missing_ranked.inventory_tag_packet_no,
       missing_ranked.product_pieces,
       missing_ranked.product_gross_wt,
       missing_ranked.product_net_wt,
       missing_ranked.product_counter_name,
       missing_ranked.product_size,
       missing_ranked.product_tag_type,
       missing_ranked.product_item_pieces,
       missing_ranked.product_weight_gram,
       missing_ranked.product_weight_carat,
       missing_ranked.product_created_at
     ${baseFrom}
     ORDER BY missing_ranked.verification_date DESC, missing_ranked.tag_no ASC`,
    params,
  );

  return {
    summary: {
      foundCount: summary.foundCount,
      missingCount: summary.missingCount,
      newCount: summary.newCount,
    },
    data: dataRows.map(mapRow),
  };
};

const getAllCombinedReportRows = async (filters) => {
  const summary = await getHeaderSummary(filters);

  const stored = await getAllStoredReportRows(filters);
  const missing = await getAllMissingReportRows(filters);

  // Combine stored (FOUND/NEW) and dynamically generated MISSING rows
  const combined = [...stored.data, ...missing.data];

  // Sort to match stored report ordering: FOUND, NEW, then MISSING
  combined.sort((a, b) => {
    const order = { FOUND: 0, NEW: 1, MISSING: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    if (a.verificationDate > b.verificationDate) return -1;
    if (a.verificationDate < b.verificationDate) return 1;
    return String(a.tagNo ?? "").localeCompare(String(b.tagNo ?? ""));
  });

  return {
    summary: {
      foundCount: summary.foundCount,
      missingCount: summary.missingCount,
      newCount: summary.newCount,
    },
    data: combined,
  };
};

const getAllReportRows = async (filters) => {
  if (filters.status === "MISSING") {
    return getAllMissingReportRows(filters);
  }

  if (filters.status === "FOUND" || filters.status === "NEW") {
    return getAllStoredReportRows(filters);
  }

  return getAllCombinedReportRows(filters);
};

const getExcelExportRows = async (filters) => {
  const summary = await getHeaderSummary(filters);

  // If explicit MISSING requested, export only missing rows
  if (filters.status === "MISSING") {
    if (summary.missingCount > MAX_EXPORT_ROWS) {
      throw new ApiError(
        400,
        `Export limit exceeded. Narrow filters to ${MAX_EXPORT_ROWS} records or fewer.`,
      );
    }

    const { baseFrom, params } = buildMissingQueryParts(filters);
    const [dataRows] = await pool.execute(
      `SELECT
         missing_ranked.verification_date,
         missing_ranked.product_name,
         missing_ranked.sub_product_name,
         missing_ranked.center_name,
         missing_ranked.tag_no,
         missing_ranked.status,
         missing_ranked.product_tran_no,
         missing_ranked.product_tran_date,
         missing_ranked.product_pieces,
         missing_ranked.product_gross_wt,
         missing_ranked.product_net_wt,
         missing_ranked.product_counter_name,
         missing_ranked.product_size,
         missing_ranked.product_tag_type,
         missing_ranked.product_item_pieces,
         missing_ranked.product_weight_gram,
         missing_ranked.product_weight_carat,
         missing_ranked.inventory_product,
         missing_ranked.inventory_sub_product
       ${baseFrom}
       ORDER BY missing_ranked.verification_date DESC, missing_ranked.tag_no ASC`,
      params,
    );

    return {
      summary: {
        foundCount: summary.foundCount,
        missingCount: summary.missingCount,
        newCount: summary.newCount,
      },
      data: dataRows.map((row) => mapExcelRow(row)),
    };
  }

  // If explicit FOUND or NEW requested, export stored rows only
  if (filters.status === "FOUND" || filters.status === "NEW") {
    const exportableCount = getStoredRecordCount(summary, filters);

    if (exportableCount > MAX_EXPORT_ROWS) {
      throw new ApiError(
        400,
        `Export limit exceeded. Narrow filters to ${MAX_EXPORT_ROWS} records or fewer.`,
      );
    }

    const { whereClause, params } = buildStoredDetailFilterClause(filters);

    const [dataRows] = await pool.execute(
      `${EXCEL_DETAIL_SELECT_SQL},
              ${EXCEL_PRODUCT_SELECT_SQL}
       ${DETAIL_FROM_SQL}
       ${PRODUCT_JOIN_SQL}
       WHERE ${whereClause}
       ${STORED_REPORT_ORDER_SQL}`,
      params,
    );

    return {
      summary: {
        foundCount: summary.foundCount,
        missingCount: summary.missingCount,
        newCount: summary.newCount,
      },
      data: dataRows.map(mapExcelRow),
    };
  }

  // No specific status: combine stored (FOUND/NEW) + dynamic MISSING for export
  const totalRecords = summary.foundCount + summary.newCount + summary.missingCount;
  if (totalRecords > MAX_EXPORT_ROWS) {
    throw new ApiError(
      400,
      `Export limit exceeded. Narrow filters to ${MAX_EXPORT_ROWS} records or fewer.`,
    );
  }

  // Stored rows (FOUND + NEW)
  const { whereClause, params } = buildStoredDetailFilterClause(filters);

  const [storedRows] = await pool.execute(
    `${EXCEL_DETAIL_SELECT_SQL},
            ${EXCEL_PRODUCT_SELECT_SQL}
     ${DETAIL_FROM_SQL}
     ${PRODUCT_JOIN_SQL}
     WHERE ${whereClause}
     ${STORED_REPORT_ORDER_SQL}`,
    params,
  );

  // Missing rows (dynamic)
  const { baseFrom: missingBaseFrom, params: missingParams } =
    buildMissingQueryParts(filters);
  const [missingRows] = await pool.execute(
    `SELECT
       missing_ranked.verification_date,
       missing_ranked.product_name,
       missing_ranked.sub_product_name,
       missing_ranked.center_name,
       missing_ranked.tag_no,
       missing_ranked.status,
       missing_ranked.product_tran_no,
       missing_ranked.product_tran_date,
       missing_ranked.product_pieces,
       missing_ranked.product_gross_wt,
       missing_ranked.product_net_wt,
       missing_ranked.product_counter_name,
       missing_ranked.product_size,
       missing_ranked.product_tag_type,
       missing_ranked.product_item_pieces,
       missing_ranked.product_weight_gram,
       missing_ranked.product_weight_carat,
       missing_ranked.inventory_product,
       missing_ranked.inventory_sub_product
     ${missingBaseFrom}
     ORDER BY missing_ranked.verification_date DESC, missing_ranked.tag_no ASC`,
    missingParams,
  );

  const combined = [...storedRows.map((r) => mapExcelRow(r)), ...missingRows.map((r) => mapExcelRow(r))];

  combined.sort((a, b) => {
    const order = { FOUND: 0, NEW: 1, MISSING: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    if (a.verificationDate > b.verificationDate) return -1;
    if (a.verificationDate < b.verificationDate) return 1;
    return String(a.tagNo ?? "").localeCompare(String(b.tagNo ?? ""));
  });

  return {
    summary: {
      foundCount: summary.foundCount,
      missingCount: summary.missingCount,
      newCount: summary.newCount,
    },
    data: combined,
  };
};

const exportReport = async (filters, exportType) => {
  const startedAt = Date.now();
  logReport("export started", { exportType, filters });

  const fetchStartedAt = Date.now();
  const isPdfExport = exportType === "pdf";
  const { summary, data } = isPdfExport
    ? await getAllReportRows(filters)
    : await getExcelExportRows(filters);

  const [[dbTimeRow]] = await pool.execute("SELECT NOW() as currentTime");
  const dbTime = formatDateTime(dbTimeRow.currentTime);

  logReport("rows fetched for export", {
    exportType,
    rowCount: data.length,
    summary,
    fetchDurationMs: Date.now() - fetchStartedAt,
    durationMs: Date.now() - startedAt,
  });

  if (isPdfExport) {
    const buffer = await buildPdfBuffer(data, summary, filters, dbTime);
    const fileName = getExportFileName("pdf");

    logReport("export completed", {
      exportType: "pdf",
      fileName,
      bufferBytes: buffer.length,
      durationMs: Date.now() - startedAt,
    });

    return {
      buffer,
      contentType: "application/pdf",
      fileName,
    };
  }

  const buffer = await buildExcelBuffer(data, summary, filters, dbTime);
  const fileName = getExportFileName("excel");

  logReport("export completed", {
    exportType: "excel",
    fileName,
    bufferBytes: buffer.length,
    durationMs: Date.now() - startedAt,
  });

  return {
    buffer,
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileName,
  };
};

export default {
  getReport,
  exportReport,
  VALID_STATUSES,
};
