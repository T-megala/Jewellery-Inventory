import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";
import { getActiveBatchId } from "./productBatchService.js";
import {
  buildExcelBuffer,
  buildPdfBuffer,
  getExportFileName,
} from "../utils/reportExport.js";

const VALID_STATUSES = ["FOUND", "MISSING", "NEW"];
const MAX_EXPORT_ROWS = 50000;

const PRODUCT_JOIN_SQL = `
  LEFT JOIN products p ON
    p.batch_id = sv.batch_id
    AND UPPER(TRIM(p.barcode)) = svd.tag_no
`;

const PRODUCT_SELECT_SQL = `
  p.id AS product_id,
  p.item_description AS inventory_item_description,
  p.closing_bal_qty AS product_closing_bal_qty
`;

const DETAIL_FROM_SQL = `
  FROM stock_verification_details svd
  INNER JOIN stock_verification sv ON sv.id = svd.verification_id
`;

const DETAIL_SELECT_SQL = `
  SELECT svd.id, svd.verification_id, sv.verification_date,
         svd.item_description, svd.tag_no, svd.status, svd.created_at
`;

const EXCEL_DETAIL_SELECT_SQL = `
  SELECT sv.verification_date, svd.item_description, svd.tag_no, svd.status
`;

const STORED_REPORT_ORDER_SQL = `
  ORDER BY
    FIELD(svd.status, 'FOUND', 'NEW'),
    sv.verification_date DESC,
    svd.id DESC
`;

const buildNotFoundCondition = () => `
  NOT EXISTS (
    SELECT 1
    FROM stock_verification_details svd_found
    WHERE svd_found.verification_id = sv.id
      AND svd_found.tag_no = UPPER(TRIM(p.barcode))
      AND svd_found.status = 'FOUND'
  )
`;

const buildMissingRankedFromSql = (headerWhereClause) => `
  FROM (
    SELECT
      NULL AS id,
      sv.id AS verification_id,
      sv.verification_date,
      p.item_description,
      UPPER(TRIM(p.barcode)) AS tag_no,
      'MISSING' AS status,
      NULL AS created_at,
      p.id AS product_id,
      p.item_description AS inventory_item_description,
      p.closing_bal_qty AS product_closing_bal_qty
    FROM stock_verification sv
    INNER JOIN products p ON
      p.batch_id = sv.batch_id
      AND p.barcode IS NOT NULL
      AND TRIM(p.barcode) != ''
    WHERE ${buildNotFoundCondition()}
      AND ${headerWhereClause}
  ) missing_ranked
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

const toNumber = (value) =>
  value === null || value === undefined ? null : Number(value);

const buildHeaderFilterClause = (filters) => {
  const conditions = ["1 = 1"];
  const params = [];

  if (filters.fromDate && filters.toDate) {
    conditions.push("AND DATE(sv.verification_date) BETWEEN ? AND ?");
    params.push(filters.fromDate, filters.toDate);
  }

  return { whereClause: conditions.join(" "), params };
};

const buildStoredDetailFilterClause = (filters) => {
  const conditions = ["1 = 1"];
  const params = [];

  if (filters.search) {
    conditions.push(
      "AND (svd.tag_no LIKE ? OR svd.item_description LIKE ?)",
    );
    const term = `%${filters.search}%`;
    params.push(term, term);
  }

  if (filters.status === "FOUND" || filters.status === "NEW") {
    conditions.push("AND svd.status = ?");
    params.push(filters.status);
  } else {
    conditions.push("AND svd.status IN ('FOUND', 'NEW')");
  }

  if (filters.fromDate && filters.toDate) {
    conditions.push("AND DATE(sv.verification_date) BETWEEN ? AND ?");
    params.push(filters.fromDate, filters.toDate);
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

const resolveItemDescription = (row) => {
  if (row.status === "NEW") {
    return row.item_description ?? "--";
  }

  return (
    row.inventory_item_description ??
    row.item_description ??
    null
  );
};

const mapExcelRow = (row) => ({
  verificationDate: formatDateTime(row.verification_date),
  barcode: row.tag_no,
  itemDescription: resolveItemDescription(row),
  closingBalQty: toNumber(row.product_closing_bal_qty),
  status: row.status,
  tagNo: row.tag_no,
  productName: resolveItemDescription(row),
  subProductName: "--",
  centerName: "--",
  pieces: toNumber(row.product_closing_bal_qty),
});

const mapRow = (row) => {
  const itemDescription = resolveItemDescription(row);
  const closingBalQty = toNumber(row.product_closing_bal_qty);

  return {
    id: row.id ?? null,
    verificationId: row.verification_id,
    verificationDate: formatDateTime(row.verification_date),
    barcode: row.tag_no,
    tagNo: row.tag_no,
    itemDescription,
    productName: itemDescription,
    subProductName: "--",
    centerName: "--",
    closingBalQty,
    pieces: closingBalQty,
    status: row.status,
    createdAt: formatDateTime(row.created_at),
    product: row.product_id
      ? {
          id: Number(row.product_id),
          itemDescription,
          closingBalQty,
        }
      : null,
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

const buildMissingQueryParts = async (filters) => {
  const { whereClause, params } = buildHeaderFilterClause(filters);

  return {
    baseFrom: buildMissingRankedFromSql(whereClause),
    params,
  };
};

const enrichRowsWithProducts = async (rows) => {
  if (rows.length === 0) {
    return rows;
  }

  const tags = [
    ...new Set(rows.map((row) => String(row.tag_no ?? "").trim()).filter(Boolean)),
  ];

  if (tags.length === 0) {
    return rows;
  }

  const verificationIds = [
    ...new Set(rows.map((row) => row.verification_id).filter(Boolean)),
  ];

  if (verificationIds.length === 0) {
    return rows;
  }

  const tagPlaceholders = tags.map(() => "?").join(", ");
  const verificationPlaceholders = verificationIds.map(() => "?").join(", ");

  const [productRows] = await pool.execute(
    `SELECT sv.id AS verification_id, UPPER(TRIM(p.barcode)) AS tag_no,
            p.id AS product_id, p.item_description, p.closing_bal_qty
     FROM stock_verification sv
     INNER JOIN products p ON p.batch_id = sv.batch_id
     WHERE sv.id IN (${verificationPlaceholders})
       AND UPPER(TRIM(p.barcode)) IN (${tagPlaceholders})`,
    [...verificationIds, ...tags],
  );

  const productByKey = new Map(
    productRows.map((row) => [
      `${row.verification_id}:${String(row.tag_no).trim().toUpperCase()}`,
      row,
    ]),
  );

  return rows.map((row) => {
    const product = productByKey.get(
      `${row.verification_id}:${String(row.tag_no ?? "").trim().toUpperCase()}`,
    );

    if (!product) {
      return row;
    }

    return {
      ...row,
      product_id: product.product_id,
      inventory_item_description: product.item_description,
      product_closing_bal_qty: product.closing_bal_qty,
    };
  });
};

const getMissingRows = async (filters, pagination) => {
  const { baseFrom, params } = await buildMissingQueryParts(filters);
  const { limit, offset } = pagination;

  const [dataRows] = await pool.execute(
    `SELECT
       missing_ranked.id,
       missing_ranked.verification_id,
       missing_ranked.verification_date,
       missing_ranked.item_description,
       missing_ranked.tag_no,
       missing_ranked.status,
       missing_ranked.created_at,
       missing_ranked.product_id,
       missing_ranked.inventory_item_description,
       missing_ranked.product_closing_bal_qty
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

const getCombinedRows = async (filters, pagination) => {
  const { limit, offset } = pagination;
  const { whereClause: headerWhereClause, params: headerParams } =
    buildHeaderFilterClause(filters);
  const { whereClause: detailWhereClause, params: detailParams } =
    buildStoredDetailFilterClause(filters);

  const [dataRows] = await pool.execute(
    `SELECT combined_data.* FROM (
      SELECT
        svd.id,
        svd.verification_id,
        sv.verification_date,
        svd.item_description,
        svd.tag_no,
        svd.status,
        svd.created_at,
        p.id AS product_id,
        p.item_description AS inventory_item_description,
        p.closing_bal_qty AS product_closing_bal_qty
      FROM stock_verification_details svd
      INNER JOIN stock_verification sv ON sv.id = svd.verification_id
      ${PRODUCT_JOIN_SQL}
      WHERE svd.status = 'FOUND' AND ${detailWhereClause}

      UNION ALL

      SELECT
        svd.id,
        svd.verification_id,
        sv.verification_date,
        svd.item_description,
        svd.tag_no,
        svd.status,
        svd.created_at,
        p.id AS product_id,
        p.item_description AS inventory_item_description,
        p.closing_bal_qty AS product_closing_bal_qty
      FROM stock_verification_details svd
      INNER JOIN stock_verification sv ON sv.id = svd.verification_id
      ${PRODUCT_JOIN_SQL}
      WHERE svd.status = 'NEW' AND ${detailWhereClause}

      UNION ALL

      SELECT
        missing_ranked.id,
        missing_ranked.verification_id,
        missing_ranked.verification_date,
        missing_ranked.item_description,
        missing_ranked.tag_no,
        missing_ranked.status,
        missing_ranked.created_at,
        missing_ranked.product_id,
        missing_ranked.inventory_item_description,
        missing_ranked.product_closing_bal_qty
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

  if (filters.status === "MISSING") {
    const totalRecords = summary.missingCount;
    const totalPages = totalRecords === 0 ? 0 : Math.ceil(totalRecords / limit);
    const data = await getMissingRows(filters, pagination);

    return {
      pagination: { page, limit, totalRecords, totalPages },
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
      pagination: { page, limit, totalRecords, totalPages },
      summary: {
        foundCount: summary.foundCount,
        missingCount: summary.missingCount,
        newCount: summary.newCount,
      },
      data: enrichedRows.map(mapRow),
    };
  }

  const totalRecords =
    summary.foundCount + summary.newCount + summary.missingCount;
  const totalPages = totalRecords === 0 ? 0 : Math.ceil(totalRecords / limit);
  const dataRows = await getCombinedRows(filters, pagination);

  return {
    pagination: { page, limit, totalRecords, totalPages },
    summary: {
      foundCount: summary.foundCount,
      missingCount: summary.missingCount,
      newCount: summary.newCount,
    },
    data: dataRows.map(mapRow),
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

  const { baseFrom, params } = await buildMissingQueryParts(filters);

  const [dataRows] = await pool.execute(
    `SELECT
       missing_ranked.id,
       missing_ranked.verification_id,
       missing_ranked.verification_date,
       missing_ranked.item_description,
       missing_ranked.tag_no,
       missing_ranked.status,
       missing_ranked.created_at,
       missing_ranked.product_id,
       missing_ranked.inventory_item_description,
       missing_ranked.product_closing_bal_qty
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
  const combined = [...stored.data, ...missing.data];

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

  if (filters.status === "MISSING") {
    if (summary.missingCount > MAX_EXPORT_ROWS) {
      throw new ApiError(
        400,
        `Export limit exceeded. Narrow filters to ${MAX_EXPORT_ROWS} records or fewer.`,
      );
    }

    const { baseFrom, params } = await buildMissingQueryParts(filters);
    const [dataRows] = await pool.execute(
      `SELECT
         missing_ranked.verification_date,
         missing_ranked.item_description,
         missing_ranked.tag_no,
         missing_ranked.status,
         missing_ranked.inventory_item_description,
         missing_ranked.product_closing_bal_qty
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

  if (filters.status === "FOUND" || filters.status === "NEW") {
    const exportableCount = getStoredRecordCount(summary, filters);

    if (exportableCount > MAX_EXPORT_ROWS) {
      throw new ApiError(
        400,
        `Export limit exceeded. Narrow filters to ${MAX_EXPORT_ROWS} records or fewer.`,
      );
    }

    const { baseFrom, params } = buildExportQuery(filters);
    const [dataRows] = await pool.execute(
      `${EXCEL_DETAIL_SELECT_SQL},
              p.item_description AS inventory_item_description,
              p.closing_bal_qty AS product_closing_bal_qty
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
      data: dataRows.map((row) => mapExcelRow(row)),
    };
  }

  const totalRecords =
    summary.foundCount + summary.newCount + summary.missingCount;
  if (totalRecords > MAX_EXPORT_ROWS) {
    throw new ApiError(
      400,
      `Export limit exceeded. Narrow filters to ${MAX_EXPORT_ROWS} records or fewer.`,
    );
  }

  const { baseFrom, params } = buildExportQuery(filters);
  const [storedRows] = await pool.execute(
    `${EXCEL_DETAIL_SELECT_SQL},
            p.item_description AS inventory_item_description,
            p.closing_bal_qty AS product_closing_bal_qty
     ${baseFrom}
     ${STORED_REPORT_ORDER_SQL}`,
    params,
  );

  const { baseFrom: missingBaseFrom, params: missingParams } =
    await buildMissingQueryParts(filters);
  const [missingRows] = await pool.execute(
    `SELECT
       missing_ranked.verification_date,
       missing_ranked.item_description,
       missing_ranked.tag_no,
       missing_ranked.status,
       missing_ranked.inventory_item_description,
       missing_ranked.product_closing_bal_qty
     ${missingBaseFrom}
     ORDER BY missing_ranked.verification_date DESC, missing_ranked.tag_no ASC`,
    missingParams,
  );

  const combined = [
    ...storedRows.map((row) => mapExcelRow(row)),
    ...missingRows.map((row) => mapExcelRow(row)),
  ];

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

    return {
      buffer,
      contentType: "application/pdf",
      fileName,
    };
  }

  const buffer = await buildExcelBuffer(data, summary, filters, dbTime);
  const fileName = getExportFileName("excel");

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
