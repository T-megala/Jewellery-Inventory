import pool from "../config/database.js";

const VALID_STATUSES = ["FOUND", "MISSING", "NEW"];

const formatDateTime = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

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

const getReport = async (filters, pagination) => {
  const { whereClause, params } = buildFilterClause(filters);
  const { page, limit, offset } = pagination;

  const baseFrom = `
    FROM stock_verification_details svd
    INNER JOIN stock_verification sv ON sv.id = svd.verification_id
    WHERE ${whereClause}
  `;

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS totalRecords ${baseFrom}`,
    params,
  );
  const totalRecords = Number(countRows[0].totalRecords);
  const totalPages = totalRecords === 0 ? 0 : Math.ceil(totalRecords / limit);

  const [summaryRows] = await pool.execute(
    `SELECT
       SUM(CASE WHEN svd.status = 'FOUND' THEN 1 ELSE 0 END) AS foundCount,
       SUM(CASE WHEN svd.status = 'MISSING' THEN 1 ELSE 0 END) AS missingCount,
       SUM(CASE WHEN svd.status = 'NEW' THEN 1 ELSE 0 END) AS newCount
     ${baseFrom}`,
    params,
  );

  // LIMIT/OFFSET must be inlined — mysql2 prepared statements can return empty rows
  const [dataRows] = await pool.execute(
    `SELECT svd.id, svd.verification_id, sv.verification_date,
            svd.product_name, svd.sub_product_name, svd.center_name,
            svd.tag_no, svd.status, svd.created_at
     ${baseFrom}
     ORDER BY sv.verification_date DESC, svd.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  return {
    pagination: { page, limit, totalRecords, totalPages },
    summary: {
      foundCount: Number(summaryRows[0].foundCount ?? 0),
      missingCount: Number(summaryRows[0].missingCount ?? 0),
      newCount: Number(summaryRows[0].newCount ?? 0),
    },
    data: dataRows.map(mapRow),
  };
};

export default { getReport, VALID_STATUSES };
