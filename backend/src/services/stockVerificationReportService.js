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
const STATUS_QUERY_ORDER = ["FOUND", "NEW", "MISSING"];
const MAX_EXPORT_ROWS = 50000;

const normalizeStatuses = (statuses = []) => {
  const normalized = [
    ...new Set(
      (Array.isArray(statuses) ? statuses : [])
        .map((value) => String(value).trim().toUpperCase())
        .filter(Boolean),
    ),
  ];

  return STATUS_QUERY_ORDER.filter((status) => normalized.includes(status));
};

const getStatusSegments = (filters, daySummary) => {
  const selected = normalizeStatuses(filters.statuses);
  const allSegments = [
    { status: "FOUND", count: Number(daySummary.foundCount ?? 0) },
    { status: "NEW", count: Number(daySummary.newCount ?? 0) },
    { status: "MISSING", count: Number(daySummary.missingCount ?? 0) },
  ];

  return selected.length === 0
    ? allSegments
    : allSegments.filter((segment) => selected.includes(segment.status));
};

const getTotalRecordsForStatuses = (daySummary, filters) =>
  getStatusSegments(filters, daySummary).reduce(
    (total, segment) => total + segment.count,
    0,
  );

const includesStoredStatuses = (filters) => {
  const selected = normalizeStatuses(filters.statuses);

  return (
    selected.length === 0 ||
    selected.some((status) => status === "FOUND" || status === "NEW")
  );
};

const includesMissingStatus = (filters) => {
  const selected = normalizeStatuses(filters.statuses);

  return selected.length === 0 || selected.includes("MISSING");
};

const LATEST_SCAN_SUBQUERY = `
  SELECT verification_id, MAX(id) AS latest_scan_id
  FROM latest_stock_verification
  GROUP BY verification_id
`;

const LATEST_SCAN_JOIN_SQL = `
  INNER JOIN (${LATEST_SCAN_SUBQUERY}) latest ON latest.verification_id = sv.id
  INNER JOIN latest_stock_verification lsv ON lsv.id = latest.latest_scan_id
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
    (
      sv.product_name = '${SCOPE_NAMES.ALL_PRODUCTS}'
      AND p.batch_id = ${ACTIVE_BATCH_FOR_BRANCH_SQL}
    )
    OR (
      sv.product_name != '${SCOPE_NAMES.ALL_PRODUCTS}'
      AND (p.batch_id = ${ACTIVE_BATCH_FOR_BRANCH_SQL} OR p.batch_id IS NULL)
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

const buildBranchFilterClause = (filters, tablePrefix = "sv") => {
  const branchIds = filters.branchIds ?? [];

  if (branchIds.length === 0) {
    return { clause: "AND 1 = 0", params: [] };
  }

  if (branchIds.length === 1) {
    return {
      clause: `AND ${tablePrefix}.branch_id = ?`,
      params: [branchIds[0]],
    };
  }

  const placeholders = branchIds.map(() => "?").join(", ");

  return {
    clause: `AND ${tablePrefix}.branch_id IN (${placeholders})`,
    params: branchIds,
  };
};

const buildDateFilterClause = (filters, tablePrefix = "sv") => ({
  clause: `AND ${tablePrefix}.verification_day = ?`,
  params: [filters.date],
});

const DETAIL_FROM_SQL = `
  FROM stock_verification_details svd
  INNER JOIN stock_verification sv ON sv.id = svd.verification_id
  LEFT JOIN branches b ON b.id = sv.branch_id
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

const appendScopeValueFilter = (
  values,
  column,
  conditions,
  params,
  { keyword = "AND" } = {},
) => {
  const list = Array.isArray(values)
    ? values.map((value) => String(value).trim()).filter(Boolean)
    : [];

  if (list.length === 0) {
    return;
  }

  const prefix = keyword ? `${keyword} ` : "";

  if (list.length === 1) {
    conditions.push(`${prefix}${column} = ?`);
    params.push(list[0]);
    return;
  }

  const placeholders = list.map(() => "?").join(", ");
  conditions.push(`${prefix}${column} IN (${placeholders})`);
  params.push(...list);
};

const appendDetailInventoryScopeFilters = (filters, conditions, params) => {
  const appendExistsFilter = (values, column) => {
    const list = Array.isArray(values)
      ? values.map((value) => String(value).trim()).filter(Boolean)
      : [];

    if (list.length === 0) {
      return;
    }

    const placeholders = list.map(() => "?").join(", ");
    conditions.push(`AND EXISTS (
      SELECT 1
      FROM products p_inv
      INNER JOIN product_upload_batches pub_inv
        ON pub_inv.id = p_inv.batch_id
       AND pub_inv.branch_id = sv.branch_id
       AND pub_inv.is_active = 1
      WHERE UPPER(TRIM(p_inv.tag_packet_no)) = UPPER(TRIM(svd.tag_no))
        AND p_inv.${column} IN (${placeholders})
    )`);
    params.push(...list);
  };

  appendExistsFilter(filters.productNames, "product");
  appendExistsFilter(filters.subProductNames, "sub_product");
  appendExistsFilter(filters.centerNames, "counter_name");
};

const appendScopeFilters = (filters, conditions, params, tablePrefix = "sv") => {
  appendScopeValueFilter(
    filters.productNames,
    `${tablePrefix}.product_name`,
    conditions,
    params,
  );
  appendScopeValueFilter(
    filters.subProductNames,
    `${tablePrefix}.sub_product_name`,
    conditions,
    params,
  );
  appendScopeValueFilter(
    filters.centerNames,
    `${tablePrefix}.center_name`,
    conditions,
    params,
  );
};

const appendHeaderSessionFilters = (
  filters,
  conditions,
  params,
  tablePrefix = "sv",
) => {
  appendScopeFilters(filters, conditions, params, tablePrefix);

  if (filters.verificationId) {
    conditions.push(`AND ${tablePrefix}.id = ?`);
    params.push(filters.verificationId);
  }

  const branchFilter = buildBranchFilterClause(filters, tablePrefix);
  const dateFilter = buildDateFilterClause(filters, tablePrefix);

  if (branchFilter.clause) {
    conditions.push(branchFilter.clause);
    params.push(...branchFilter.params);
  }

  if (dateFilter.clause) {
    conditions.push(dateFilter.clause);
    params.push(...dateFilter.params);
  }
};

const buildHeaderFilterClause = (filters) => {
  const conditions = ["1 = 1"];
  const params = [];

  appendHeaderSessionFilters(filters, conditions, params, "sv");

  return { whereClause: conditions.join(" "), params };
};

const buildDetailSummaryFilterClause = (filters) => {
  const conditions = ["1 = 1"];
  const params = [];

  appendDetailInventoryScopeFilters(filters, conditions, params);

  const branchFilter = buildBranchFilterClause(filters, "sv");
  const dateFilter = buildDateFilterClause(filters, "sv");

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

const buildInventoryProductScopeClause = (filters, tablePrefix = "p") => {
  const conditions = [
    `${tablePrefix}.tag_packet_no IS NOT NULL`,
    `TRIM(${tablePrefix}.tag_packet_no) != ''`,
  ];
  const params = [];

  appendScopeValueFilter(
    filters.productNames,
    `${tablePrefix}.product`,
    conditions,
    params,
    { keyword: "" },
  );
  appendScopeValueFilter(
    filters.subProductNames,
    `${tablePrefix}.sub_product`,
    conditions,
    params,
    { keyword: "" },
  );
  appendScopeValueFilter(
    filters.centerNames,
    `${tablePrefix}.counter_name`,
    conditions,
    params,
    { keyword: "" },
  );

  return { conditions, params };
};

const buildInventoryNotFoundCondition = (filters) => ({
  sql: `
      NOT EXISTS (
        SELECT 1
        FROM stock_verification_details svd_found
        INNER JOIN stock_verification sv_found ON sv_found.id = svd_found.verification_id
        WHERE sv_found.branch_id = pub.branch_id
          AND sv_found.verification_day = ?
          AND svd_found.status = 'FOUND'
          AND UPPER(TRIM(svd_found.tag_no)) = UPPER(TRIM(p.tag_packet_no))
      )`,
  params: [filters.date],
});

const buildVerificationSessionExistsCondition = (filters) => ({
  sql: `EXISTS (
      SELECT 1
      FROM stock_verification sv_day
      WHERE sv_day.verification_day = ?
        AND sv_day.branch_id = pub.branch_id
    )`,
  params: [filters.date],
});

const countVerificationSessionsForDay = async (filters) => {
  const branchFilter = buildBranchFilterClause(filters, "sv");
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS sessionCount
     FROM stock_verification sv
     WHERE sv.verification_day = ?
       ${branchFilter.clause}`,
    [filters.date, ...branchFilter.params],
  );

  return Number(rows[0]?.sessionCount ?? 0);
};

const buildInventoryMissingQueryParts = (filters) => {
  const conditions = ["pub.is_active = 1"];
  const params = [];

  const branchFilter = buildBranchFilterClause(filters, "pub");
  if (branchFilter.clause) {
    conditions.push(branchFilter.clause.replace(/^AND\s+/, ""));
    params.push(...branchFilter.params);
  }

  const sessionExists = buildVerificationSessionExistsCondition(filters);
  conditions.push(sessionExists.sql);
  params.push(...sessionExists.params);

  const productScope = buildInventoryProductScopeClause(filters, "p");
  conditions.push(...productScope.conditions);
  params.push(...productScope.params);

  const notFound = buildInventoryNotFoundCondition(filters);
  conditions.push(notFound.sql);
  params.push(...notFound.params);

  const branchFilterForMeta = buildBranchFilterClause(filters, "sv");
  const metaBranchClause = branchFilterForMeta.clause
    ? branchFilterForMeta.clause.replace(/^AND\s+/, "AND ")
    : "";

  const baseFrom = `
    FROM products p
    INNER JOIN product_upload_batches pub ON pub.id = p.batch_id
    LEFT JOIN branches b ON b.id = pub.branch_id
    LEFT JOIN (
      SELECT ranked.id, ranked.verification_date, ranked.branch_id
      FROM (
        SELECT
          sv.id,
          sv.verification_date,
          sv.branch_id,
          ROW_NUMBER() OVER (
            PARTITION BY sv.branch_id
            ORDER BY sv.verification_date DESC, sv.id DESC
          ) AS rn
        FROM stock_verification sv
        WHERE sv.verification_day = ?
          ${metaBranchClause}
      ) ranked
      WHERE ranked.rn = 1
    ) sv_meta ON sv_meta.branch_id = pub.branch_id
    WHERE ${conditions.join(" AND ")}`;

  return {
    baseFrom,
    params: [filters.date, ...branchFilterForMeta.params, ...params],
  };
};

const INVENTORY_MISSING_SELECT_SQL = `
  SELECT
    NULL AS id,
    sv_meta.id AS verification_id,
    sv_meta.verification_date,
    pub.branch_id AS branch_id,
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
    p.created_at AS product_created_at
`;

const INVENTORY_MISSING_EXCEL_SELECT_SQL = `
  SELECT
    sv_meta.verification_date,
    p.product AS product_name,
    p.sub_product AS sub_product_name,
    COALESCE(NULLIF(TRIM(p.counter_name), ''), 'Unassigned') AS center_name,
    UPPER(TRIM(p.tag_packet_no)) AS tag_no,
    'MISSING' AS status,
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
    p.weight_carat AS product_weight_carat,
    p.product AS inventory_product,
    p.sub_product AS inventory_sub_product
`;

const getInventoryMissingCount = async (filters) => {
  const sessionCount = await countVerificationSessionsForDay(filters);
  if (sessionCount === 0) {
    return 0;
  }

  const { baseFrom, params } = buildInventoryMissingQueryParts(filters);
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS missingCount
     FROM (
       SELECT DISTINCT pub.branch_id, UPPER(TRIM(p.tag_packet_no)) AS tag_no
       ${baseFrom}
     ) missing_tags`,
    params,
  );

  return Number(rows[0]?.missingCount ?? 0);
};

const buildStoredDetailFilterClause = (filters, { includeStatus = true } = {}) => {
  const conditions = ["1 = 1"];
  const params = [];

  // Match verification session scope on sv.* — detail rows for NEW tags
  // store scope labels in svd.* which may differ from the session filter.
  appendDetailInventoryScopeFilters(filters, conditions, params);

  if (filters.verificationId) {
    conditions.push("AND sv.id = ?");
    params.push(filters.verificationId);
  }

  const branchFilter = buildBranchFilterClause(filters, "sv");
  const dateFilter = buildDateFilterClause(filters, "sv");

  if (branchFilter.clause) {
    conditions.push(branchFilter.clause);
    params.push(...branchFilter.params);
  }

  if (dateFilter.clause) {
    conditions.push(dateFilter.clause);
    params.push(...dateFilter.params);
  }

  if (includeStatus) {
    const selected = normalizeStatuses(filters.statuses);
    const storedStatuses = selected.filter(
      (status) => status === "FOUND" || status === "NEW",
    );

    if (storedStatuses.length === 1) {
      conditions.push("AND svd.status = ?");
      params.push(storedStatuses[0]);
    } else if (storedStatuses.length > 1) {
      const placeholders = storedStatuses.map(() => "?").join(", ");
      conditions.push(`AND svd.status IN (${placeholders})`);
      params.push(...storedStatuses);
    } else if (selected.length === 0) {
      conditions.push("AND svd.status IN ('FOUND', 'NEW')");
    }
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
  const selected = normalizeStatuses(filters.statuses);
  const storedStatuses =
    selected.length > 0
      ? selected.filter((status) => status === "FOUND" || status === "NEW")
      : ["FOUND", "NEW"];

  if (storedStatuses.length === 0) {
    return 0;
  }

  let total = 0;

  if (storedStatuses.includes("FOUND")) {
    total += summary.foundCount;
  }

  if (storedStatuses.includes("NEW")) {
    total += summary.newCount;
  }

  return total;
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
  const { whereClause, params } = buildDetailSummaryFilterClause(filters);
  const [summaryRows] = await pool.execute(
    `SELECT
       COALESCE(SUM(CASE WHEN svd.status = 'FOUND' THEN 1 ELSE 0 END), 0) AS foundCount,
       COALESCE(SUM(CASE WHEN svd.status = 'NEW' THEN 1 ELSE 0 END), 0) AS newCount
     FROM stock_verification_details svd
     INNER JOIN stock_verification sv ON sv.id = svd.verification_id
     WHERE ${whereClause}`,
    params,
  );

  const foundCount = Number(summaryRows[0].foundCount ?? 0);
  const newCount = Number(summaryRows[0].newCount ?? 0);
  const missingCount = await getInventoryMissingCount(filters);

  return {
    foundCount,
    missingCount,
    newCount,
    totalRecords: foundCount + missingCount + newCount,
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

const buildMissingQueryParts = (filters) => buildInventoryMissingQueryParts(filters);

const buildPaginationSql = (pagination) => {
  if (!pagination) {
    return "";
  }

  return ` LIMIT ${pagination.limit} OFFSET ${pagination.offset}`;
};

const getSessionHeadersByIds = async (verificationIds) => {
  if (!verificationIds.length) {
    return [];
  }

  const placeholders = verificationIds.map(() => "?").join(", ");

  const [rows] = await pool.execute(
    `SELECT
       sv.id,
       sv.verification_date,
       sv.branch_id,
       b.name AS branch_name,
       sv.product_name,
       sv.sub_product_name,
       sv.center_name,
       COALESCE(lsv.found_count, sv.found_count, 0) AS found_count,
       COALESCE(lsv.missing_count, sv.missing_count, 0) AS missing_count,
       COALESCE(lsv.new_count, sv.new_count, 0) AS new_count
     FROM stock_verification sv
     INNER JOIN (${LATEST_SCAN_SUBQUERY}) latest ON latest.verification_id = sv.id
     INNER JOIN latest_stock_verification lsv ON lsv.id = latest.latest_scan_id
     LEFT JOIN branches b ON b.id = sv.branch_id
     WHERE sv.id IN (${placeholders})
     ORDER BY sv.verification_date DESC, sv.id DESC`,
    verificationIds,
  );

  return rows;
};

const groupRowsIntoReports = async (mappedRows) => {
  if (!mappedRows.length) {
    return [];
  }

  const orderedIds = [];
  const rowsById = new Map();

  for (const row of mappedRows) {
    const verificationId = Number(row.verificationId);
    if (!Number.isInteger(verificationId) || verificationId < 1) {
      continue;
    }

    if (!rowsById.has(verificationId)) {
      orderedIds.push(verificationId);
      rowsById.set(verificationId, []);
    }

    rowsById.get(verificationId).push(row);
  }

  if (orderedIds.length === 0) {
    return [];
  }

  const headers = await getSessionHeadersByIds(orderedIds);
  const headerById = new Map(headers.map((header) => [Number(header.id), header]));

  return orderedIds
    .map((verificationId) => {
      const header = headerById.get(verificationId);
      if (!header) {
        return null;
      }

      return {
        verificationId,
        verificationDate: formatDateTime(header.verification_date),
        branch: mapBranchFields(header),
        scope: {
          productName: header.product_name,
          subProductName: header.sub_product_name,
          centerName: header.center_name,
        },
        summary: {
          foundCount: Number(header.found_count ?? 0),
          missingCount: Number(header.missing_count ?? 0),
          newCount: Number(header.new_count ?? 0),
        },
        data: rowsById.get(verificationId) ?? [],
      };
    })
    .filter(Boolean);
};

const buildPaginationMeta = (page, limit, totalRecords) => ({
  page,
  limit,
  totalRecords,
  totalPages: totalRecords === 0 ? 0 : Math.ceil(totalRecords / limit),
});

const getReport = async (filters, pagination) => {
  const { page, limit } = pagination;
  const daySummary = await getHeaderSummary(filters);
  const summary = {
    foundCount: daySummary.foundCount,
    missingCount: daySummary.missingCount,
    newCount: daySummary.newCount,
  };

  let totalRecords;
  let mappedRows;
  const selectedStatuses = normalizeStatuses(filters.statuses);

  if (selectedStatuses.length === 1 && selectedStatuses[0] === "MISSING") {
    totalRecords = daySummary.missingCount;
    mappedRows = await getMissingRows(filters, pagination);
  } else if (
    selectedStatuses.length === 1 &&
    (selectedStatuses[0] === "FOUND" || selectedStatuses[0] === "NEW")
  ) {
    totalRecords = getStoredRecordCount(daySummary, filters);
    const dataRows = await getStoredDetailRows(filters, pagination);
    const enrichedRows = await enrichRowsWithProducts(dataRows);
    mappedRows = enrichedRows.map(mapRow);
  } else {
    totalRecords = getTotalRecordsForStatuses(daySummary, filters);
    mappedRows = await getPaginatedStatusRows(filters, pagination, daySummary);
  }

  return {
    pagination: buildPaginationMeta(page, limit, totalRecords),
    summary,
    data: mappedRows,
  };
};

const getMissingRows = async (filters, pagination) => {
  const sessionCount = await countVerificationSessionsForDay(filters);
  if (sessionCount === 0) {
    return [];
  }

  const { baseFrom, params } = buildInventoryMissingQueryParts(filters);

  const [dataRows] = await pool.execute(
    `${INVENTORY_MISSING_SELECT_SQL}
     ${baseFrom}
     ORDER BY sv_meta.verification_date DESC, pub.branch_id ASC, p.tag_packet_no ASC${buildPaginationSql(pagination)}`,
    params,
  );

  return dataRows.map((row) => mapRow(row));
};

const getStoredDetailRows = async (filters, pagination) => {
  const { baseFrom, params } = buildStoredDetailQuery(filters);

  const [dataRows] = await pool.execute(
    `${DETAIL_SELECT_SQL}
     ${baseFrom}
     ${STORED_REPORT_ORDER_SQL}${buildPaginationSql(pagination)}`,
    params,
  );

  return dataRows;
};

/**
 * Paginate across FOUND → NEW → MISSING without loading every missing row up front.
 * Order matches the combined export: Found first, then New, then Missing.
 */
const getPaginatedStatusRows = async (filters, pagination, daySummary) => {
  const { limit, offset } = pagination;
  const segments = getStatusSegments(filters, daySummary);

  let skip = offset;
  let remaining = limit;
  const mappedRows = [];

  for (const segment of segments) {
    if (remaining <= 0) {
      break;
    }

    if (skip >= segment.count) {
      skip -= segment.count;
      continue;
    }

    const segmentOffset = skip;
    const segmentLimit = Math.min(remaining, segment.count - segmentOffset);
    skip = 0;

    if (segmentLimit <= 0) {
      continue;
    }

    const segmentPagination = { limit: segmentLimit, offset: segmentOffset };

    if (segment.status === "MISSING") {
      const missingRows = await getMissingRows(filters, segmentPagination);
      mappedRows.push(...missingRows);
      remaining -= missingRows.length;
      continue;
    }

    const segmentFilters = { ...filters, statuses: [segment.status] };
    const dataRows = await getStoredDetailRows(segmentFilters, segmentPagination);
    const enrichedRows = await enrichRowsWithProducts(dataRows);
    mappedRows.push(...enrichedRows.map(mapRow));
    remaining -= dataRows.length;
  }

  return mappedRows;
};

/**
 * Fetches combined FOUND, NEW, and MISSING records in a single query.
 * Used when no status filter is provided, returning all three types together.
 */
const getCombinedRows = async (filters, pagination) => {
  const { whereClause: detailWhereClause, params: detailParams } =
    buildStoredDetailFilterClause(filters, { includeStatus: false });
  const { baseFrom: missingBaseFrom, params: missingParams } =
    buildInventoryMissingQueryParts(filters);

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
      LEFT JOIN products p ON p.batch_id = ${ACTIVE_BATCH_FOR_BRANCH_SQL}
        AND p.tag_packet_no = svd.tag_no
      WHERE svd.status = 'NEW' AND ${detailWhereClause}

      UNION ALL

      -- MISSING records (active batch products not found in any verification scan)
      ${INVENTORY_MISSING_SELECT_SQL}
      ${missingBaseFrom}
    ) combined_data
    ORDER BY
      FIELD(combined_data.status, 'FOUND', 'NEW', 'MISSING'),
      combined_data.verification_date DESC,
      combined_data.tag_no ASC${buildPaginationSql(pagination)}`,
    [...detailParams, ...detailParams, ...missingParams],
  );

  return dataRows;
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

  if (summary.missingCount === 0) {
    return {
      summary: {
        foundCount: summary.foundCount,
        missingCount: summary.missingCount,
        newCount: summary.newCount,
      },
      data: [],
    };
  }

  const { baseFrom, params } = buildInventoryMissingQueryParts(filters);

  const [dataRows] = await pool.execute(
    `${INVENTORY_MISSING_SELECT_SQL}
     ${baseFrom}
     ORDER BY sv_meta.verification_date DESC, pub.branch_id ASC, p.tag_packet_no ASC`,
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

const sortCombinedReportRows = (rows) =>
  [...rows].sort((left, right) => {
    const order = { FOUND: 0, NEW: 1, MISSING: 2 };

    if (order[left.status] !== order[right.status]) {
      return order[left.status] - order[right.status];
    }

    if (left.verificationDate > right.verificationDate) return -1;
    if (left.verificationDate < right.verificationDate) return 1;
    return String(left.tagNo ?? "").localeCompare(String(right.tagNo ?? ""));
  });

const getCombinedReportRows = async (filters) => {
  const summary = await getHeaderSummary(filters);
  const combined = [];

  if (includesStoredStatuses(filters)) {
    const stored = await getAllStoredReportRows(filters);
    combined.push(...stored.data);
  }

  if (includesMissingStatus(filters)) {
    const missing = await getAllMissingReportRows(filters);
    combined.push(...missing.data);
  }

  return {
    summary: {
      foundCount: summary.foundCount,
      missingCount: summary.missingCount,
      newCount: summary.newCount,
    },
    data: sortCombinedReportRows(combined),
  };
};

const getAllCombinedReportRows = async (filters) => getCombinedReportRows(filters);

const getAllReportRows = async (filters) => {
  const selectedStatuses = normalizeStatuses(filters.statuses);

  if (selectedStatuses.length === 1 && selectedStatuses[0] === "MISSING") {
    return getAllMissingReportRows(filters);
  }

  if (
    selectedStatuses.length === 1 &&
    (selectedStatuses[0] === "FOUND" || selectedStatuses[0] === "NEW")
  ) {
    return getAllStoredReportRows(filters);
  }

  return getCombinedReportRows(filters);
};

const getExcelExportRows = async (filters) => {
  const summary = await getHeaderSummary(filters);
  const selectedStatuses = normalizeStatuses(filters.statuses);
  const totalRecords = getTotalRecordsForStatuses(summary, filters);

  if (totalRecords > MAX_EXPORT_ROWS) {
    throw new ApiError(
      400,
      `Export limit exceeded. Narrow filters to ${MAX_EXPORT_ROWS} records or fewer.`,
    );
  }

  if (selectedStatuses.length === 1 && selectedStatuses[0] === "MISSING") {
    const { baseFrom, params } = buildInventoryMissingQueryParts(filters);
    const [dataRows] = await pool.execute(
      `${INVENTORY_MISSING_EXCEL_SELECT_SQL}
       ${baseFrom}
       ORDER BY sv_meta.verification_date DESC, pub.branch_id ASC, p.tag_packet_no ASC`,
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

  if (includesStoredStatuses(filters) && !includesMissingStatus(filters)) {
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

  const combined = [];

  if (includesStoredStatuses(filters)) {
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

    combined.push(...storedRows.map((row) => mapExcelRow(row)));
  }

  if (includesMissingStatus(filters)) {
    const { baseFrom: missingBaseFrom, params: missingParams } =
      buildInventoryMissingQueryParts(filters);
    const [missingRows] = await pool.execute(
      `${INVENTORY_MISSING_EXCEL_SELECT_SQL}
       ${missingBaseFrom}
       ORDER BY sv_meta.verification_date DESC, pub.branch_id ASC, p.tag_packet_no ASC`,
      missingParams,
    );

    combined.push(...missingRows.map((row) => mapExcelRow(row)));
  }

  return {
    summary: {
      foundCount: summary.foundCount,
      missingCount: summary.missingCount,
      newCount: summary.newCount,
    },
    data: sortCombinedReportRows(combined),
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
  normalizeStatuses,
};
