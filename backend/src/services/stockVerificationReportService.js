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

const DETAIL_FROM_SQL = `
  FROM stock_verification_details svd
  INNER JOIN stock_verification sv ON sv.id = svd.verification_id
`;

const PRODUCT_JOIN_SQL = `
  LEFT JOIN products p ON
    p.batch_id = ?
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
         svd.product_name, svd.sub_product_name, svd.center_name,
         svd.tag_no, svd.status, svd.created_at
`;

const EXCEL_DETAIL_SELECT_SQL = `
  SELECT sv.verification_date,
         svd.product_name, svd.sub_product_name, svd.center_name,
         svd.tag_no, svd.status
`;

const REPORT_ORDER_SQL = `
  ORDER BY
    FIELD(svd.status, 'FOUND', 'NEW', 'MISSING'),
    sv.verification_date DESC,
    svd.id DESC
`;

const buildFilterClause = (filters) => {
  const conditions = ["1 = 1"];
  const params = [];
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
  if (filters.status) {
    conditions.push("AND svd.status = ?");
    params.push(filters.status);
  }
  if (filters.fromDate && filters.toDate) {
    conditions.push("AND DATE(sv.verification_date) BETWEEN ? AND ?");
    params.push(filters.fromDate, filters.toDate);
  }

  return { whereClause: conditions.join(" "), params };
};

const buildDetailQuery = (filters) => {
  const { whereClause, params } = buildFilterClause(filters);

  return {
    baseFrom: `
      ${DETAIL_FROM_SQL}
      WHERE ${whereClause}
    `,
    params,
  };
};

const buildExportQuery = async (filters) => {
  const { whereClause, params } = buildFilterClause(filters);
  const activeBatchId = (await getActiveBatchId()) ?? -1;

  return {
    baseFrom: `
      ${DETAIL_FROM_SQL}
      ${PRODUCT_JOIN_SQL}
      WHERE ${whereClause}
    `,
    params: [...params, activeBatchId],
  };
};

const mapProductRow = (row) => ({
  product_id: row.id,
  product_tran_no: row.tran_no,
  product_tran_date: row.tran_date,
  inventory_product: row.product,
  inventory_sub_product: row.sub_product,
  inventory_tag_packet_no: row.tag_packet_no,
  product_pieces: row.pieces,
  product_gross_wt: row.gross_wt,
  product_net_wt: row.net_wt,
  product_counter_name: row.counter_name,
  product_size: row.size,
  product_tag_type: row.tag_type,
  product_item_pieces: row.item_pieces,
  product_weight_gram: row.weight_gram,
  product_weight_carat: row.weight_carat,
  product_created_at: row.created_at,
});

const enrichRowsWithProducts = async (rows, activeBatchId) => {
  if (rows.length === 0 || !activeBatchId) {
    return rows;
  }

  const tags = [...new Set(rows.map((row) => String(row.tag_no ?? "").trim()).filter(Boolean))];

  if (tags.length === 0) {
    return rows;
  }

  const placeholders = tags.map(() => "?").join(", ");
  const [productRows] = await pool.execute(
    `SELECT id, tran_no, tran_date, product, sub_product, tag_packet_no,
            pieces, gross_wt, net_wt, counter_name, size, tag_type,
            item_pieces, weight_gram, weight_carat, created_at
     FROM products
     WHERE batch_id = ?
       AND tag_packet_no IN (${placeholders})`,
    [activeBatchId, ...tags],
  );

  const productByTag = new Map(
    productRows.map((row) => [String(row.tag_packet_no ?? "").trim().toUpperCase(), row]),
  );

  return rows.map((row) => {
    const product = productByTag.get(String(row.tag_no ?? "").trim().toUpperCase());

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

const mapExcelRow = (row) => ({
  verificationDate: formatDateTime(row.verification_date),
  productName: row.product_name,
  subProductName: row.sub_product_name,
  centerName: row.center_name,
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
});

const mapRow = (row) => {
  const productFields = mapProductFields(row);

  return {
    id: row.id,
    verificationId: row.verification_id,
    verificationDate: formatDateTime(row.verification_date),
    productName: row.product_name,
    subProductName: row.sub_product_name,
    centerName: row.center_name,
    tagNo: row.tag_no,
    status: row.status,
    pieces: productFields.pieces,
    createdAt: formatDateTime(row.created_at),
    product: row.product_id ? productFields : null,
    ...productFields,
  };
};

const getSummary = async (baseFrom, params) => {
  const [summaryRows] = await pool.execute(
    `SELECT
       SUM(CASE WHEN svd.status = 'FOUND' THEN 1 ELSE 0 END) AS foundCount,
       SUM(CASE WHEN svd.status = 'MISSING' THEN 1 ELSE 0 END) AS missingCount,
       SUM(CASE WHEN svd.status = 'NEW' THEN 1 ELSE 0 END) AS newCount,
       COUNT(*) AS totalRecords
     ${baseFrom}`,
    params,
  );

  return {
    foundCount: Number(summaryRows[0].foundCount ?? 0),
    missingCount: Number(summaryRows[0].missingCount ?? 0),
    newCount: Number(summaryRows[0].newCount ?? 0),
    totalRecords: Number(summaryRows[0].totalRecords ?? 0),
  };
};

const getReport = async (filters, pagination) => {
  const { baseFrom, params } = buildDetailQuery(filters);
  const { page, limit, offset } = pagination;

  const [[summary, dataRows], activeBatchId] = await Promise.all([
    Promise.all([
      getSummary(baseFrom, params),
      pool.execute(
        `${DETAIL_SELECT_SQL}
         ${baseFrom}
         ${REPORT_ORDER_SQL}
         LIMIT ${limit} OFFSET ${offset}`,
        params,
      ).then(([rows]) => rows),
    ]),
    getActiveBatchId(),
  ]);

  const totalPages =
    summary.totalRecords === 0 ? 0 : Math.ceil(summary.totalRecords / limit);

  const enrichedRows = await enrichRowsWithProducts(dataRows, activeBatchId);

  return {
    pagination: {
      page,
      limit,
      totalRecords: summary.totalRecords,
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

const getAllReportRows = async (filters) => {
  const { baseFrom: detailFrom, params: detailParams } = buildDetailQuery(filters);
  const summary = await getSummary(detailFrom, detailParams);

  if (summary.totalRecords > MAX_EXPORT_ROWS) {
    throw new ApiError(
      400,
      `Export limit exceeded. Narrow filters to ${MAX_EXPORT_ROWS} records or fewer.`,
    );
  }

  const { baseFrom, params } = await buildExportQuery(filters);

  const [dataRows] = await pool.execute(
    `${DETAIL_SELECT_SQL},
            ${PRODUCT_SELECT_SQL}
     ${baseFrom}
     ${REPORT_ORDER_SQL}`,
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

const getExcelExportRows = async (filters) => {
  const { whereClause, params } = buildFilterClause(filters);
  const { baseFrom: detailFrom, params: detailParams } = buildDetailQuery(filters);
  const activeBatchId = (await getActiveBatchId()) ?? -1;

  const [summary, dataRows] = await Promise.all([
    getSummary(detailFrom, detailParams),
    pool
      .execute(
        `${EXCEL_DETAIL_SELECT_SQL},
                ${EXCEL_PRODUCT_SELECT_SQL}
         ${DETAIL_FROM_SQL}
         ${PRODUCT_JOIN_SQL}
         WHERE ${whereClause}
         ${REPORT_ORDER_SQL}`,
        [...params, activeBatchId],
      )
      .then(([rows]) => rows),
  ]);

  if (summary.totalRecords > MAX_EXPORT_ROWS) {
    throw new ApiError(
      400,
      `Export limit exceeded. Narrow filters to ${MAX_EXPORT_ROWS} records or fewer.`,
    );
  }

  return {
    summary: {
      foundCount: summary.foundCount,
      missingCount: summary.missingCount,
      newCount: summary.newCount,
    },
    data: dataRows.map(mapExcelRow),
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
