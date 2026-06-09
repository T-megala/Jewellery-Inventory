import pool from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import {
  buildExcelBuffer,
  buildPdfBuffer,
  getExportFileName,
} from '../utils/reportExport.js';

const VALID_STATUSES = ['FOUND', 'MISSING', 'NEW'];
const MAX_EXPORT_ROWS = 50000;

const formatDateTime = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const buildFilterClause = (filters) => {
  const conditions = ['1 = 1'];
  const params = [];

  if (filters.productName) {
    conditions.push('AND svd.product_name = ?');
    params.push(filters.productName);
  }
  if (filters.subProductName) {
    conditions.push('AND svd.sub_product_name = ?');
    params.push(filters.subProductName);
  }
  if (filters.centerName) {
    conditions.push('AND svd.center_name = ?');
    params.push(filters.centerName);
  }
  if (filters.status) {
    conditions.push('AND svd.status = ?');
    params.push(filters.status);
  }
  if (filters.fromDate && filters.toDate) {
    conditions.push('AND DATE(sv.verification_date) BETWEEN ? AND ?');
    params.push(filters.fromDate, filters.toDate);
  }

  return { whereClause: conditions.join(' '), params };
};

const getBaseFrom = (whereClause) => `
  FROM stock_verification_details svd
  INNER JOIN stock_verification sv ON sv.id = svd.verification_id
  WHERE ${whereClause}
`;

const mapRow = (row) => ({
  id: row.id,
  verificationId: row.verification_id,
  verificationDate: formatDateTime(row.verification_date),
  productName: row.product_name,
  subProductName: row.sub_product_name,
  centerName: row.center_name,
  tagNo: row.tag_no,
  status: row.status,
  createdAt: formatDateTime(row.created_at),
});

const getSummary = async (baseFrom, params) => {
  const [summaryRows] = await pool.execute(
    `SELECT
       SUM(CASE WHEN svd.status = 'FOUND' THEN 1 ELSE 0 END) AS foundCount,
       SUM(CASE WHEN svd.status = 'MISSING' THEN 1 ELSE 0 END) AS missingCount,
       SUM(CASE WHEN svd.status = 'NEW' THEN 1 ELSE 0 END) AS newCount,
       COUNT(*) AS totalRecords
     ${baseFrom}`,
    params
  );

  return {
    foundCount: Number(summaryRows[0].foundCount ?? 0),
    missingCount: Number(summaryRows[0].missingCount ?? 0),
    newCount: Number(summaryRows[0].newCount ?? 0),
    totalRecords: Number(summaryRows[0].totalRecords ?? 0),
  };
};

const getReport = async (filters, pagination) => {
  const { whereClause, params } = buildFilterClause(filters);
  const { page, limit, offset } = pagination;
  const baseFrom = getBaseFrom(whereClause);

  const summary = await getSummary(baseFrom, params);
  const totalPages =
    summary.totalRecords === 0 ? 0 : Math.ceil(summary.totalRecords / limit);

  const [dataRows] = await pool.execute(
    `SELECT svd.id, svd.verification_id, sv.verification_date,
            svd.product_name, svd.sub_product_name, svd.center_name,
            svd.tag_no, svd.status, svd.created_at
     ${baseFrom}
     ORDER BY sv.verification_date DESC, svd.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

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
    data: dataRows.map(mapRow),
  };
};

const getAllReportRows = async (filters) => {
  const { whereClause, params } = buildFilterClause(filters);
  const baseFrom = getBaseFrom(whereClause);
  const summary = await getSummary(baseFrom, params);

  if (summary.totalRecords > MAX_EXPORT_ROWS) {
    throw new ApiError(
      400,
      `Export limit exceeded. Narrow filters to ${MAX_EXPORT_ROWS} records or fewer.`
    );
  }

  const [dataRows] = await pool.execute(
    `SELECT svd.id, svd.verification_id, sv.verification_date,
            svd.product_name, svd.sub_product_name, svd.center_name,
            svd.tag_no, svd.status, svd.created_at
     ${baseFrom}
     ORDER BY sv.verification_date DESC, svd.id DESC`,
    params
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

const exportReport = async (filters, exportType) => {
  const { summary, data } = await getAllReportRows(filters);

  if (exportType === 'pdf') {
    return {
      buffer: await buildPdfBuffer(data, summary, filters),
      contentType: 'application/pdf',
      fileName: getExportFileName('pdf'),
    };
  }

  return {
    buffer: buildExcelBuffer(data, summary, filters),
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileName: getExportFileName('excel'),
  };
};

export default {
  getReport,
  exportReport,
  VALID_STATUSES,
};
