import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";
import { getActiveBatchId } from "./productBatchService.js";
import {
  TAG_EXPR,
  buildInventoryScopeFilterFromStoredLabels,
} from "../utils/verificationScope.js";

const formatDateTime = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const toDateKey = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    const pad = (n) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  const datePrefix = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return datePrefix ? datePrefix[1] : text.slice(0, 10);
};

const mapProductCounts = (rows) =>
  rows.map((row) => ({
    productName: row.productName,
    tagNo: row.tagNo || row.tagPacketNo,
    count: Number(row.count ?? 0),
  }));

const fetchScanRow = async (scanId) => {
  const [rows] = await pool.execute(
    `SELECT
       id,
       verification_id,
       verification_date,
       verification_day,
       verification_millis,
       product_name,
       sub_product_name,
       center_name,
       total_expected,
       total_scanned,
       found_count,
       missing_count,
       new_count,
       created_at
     FROM latest_stock_verification
     WHERE id = ?`,
    [scanId],
  );

  return rows[0] ?? null;
};

const fetchLatestScanRow = async (branchId = null) => {
  const conditions = [];
  const params = [];

  if (branchId) {
    conditions.push("branch_id = ?");
    params.push(branchId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await pool.execute(
    `SELECT
       id,
       verification_id,
       verification_date,
       verification_day,
       verification_millis,
       product_name,
       sub_product_name,
       center_name,
       total_expected,
       total_scanned,
       found_count,
       missing_count,
       new_count,
       created_at
     FROM latest_stock_verification
     ${whereClause}
     ORDER BY id DESC
     LIMIT 1`,
    params,
  );

  return rows[0] ?? null;
};

const fetchDetailCountsByProduct = async (scanId, status) => {
  const [rows] = await pool.execute(
    `SELECT
       product_name AS productName,
       tag_no AS tagNo,
       COUNT(*) AS count  
     FROM stock_verification_details
     WHERE latest_scan_id = ?
       AND status = ?
     GROUP BY product_name, tag_no
     ORDER BY count DESC, product_name ASC`,
    [scanId, status],
  );

  return mapProductCounts(rows);
};

const fetchMissingCountsByProduct = async (scanRow, activeBatchId) => {
  const scope = buildInventoryScopeFilterFromStoredLabels(
    activeBatchId,
    scanRow.product_name,
    scanRow.sub_product_name,
    scanRow.center_name,
  );

  const [rows] = await pool.execute(
    `SELECT
       p.product AS productName,
       p.tag_packet_no AS tagNo,
       COUNT(DISTINCT ${TAG_EXPR}) AS count
     FROM products p
     WHERE ${scope.whereClause}
       AND NOT EXISTS (
         SELECT 1
         FROM stock_verification_details svd
         WHERE svd.latest_scan_id = ?
           AND svd.status = 'FOUND'
           AND svd.tag_no = ${TAG_EXPR}
       )
     GROUP BY p.product, p.tag_packet_no
     HAVING count > 0
     ORDER BY count DESC, p.product ASC`,
    [...scope.params, scanRow.id],
  );

  return mapProductCounts(rows);
};

const mapScanResponse = (scanRow) => ({
  id: Number(scanRow.id),
  verificationId: Number(scanRow.verification_id),
  verificationDate: formatDateTime(scanRow.verification_date),
  verificationDay:
    toDateKey(scanRow.verification_day) ?? toDateKey(scanRow.verification_date),
  scope: {
    product: scanRow.product_name,
    subProduct: scanRow.sub_product_name,
    center: scanRow.center_name,
  },
  totalExpected: Number(scanRow.total_expected ?? 0),
  totalScanned: Number(scanRow.total_scanned ?? 0),
  foundCount: Number(scanRow.found_count ?? 0),
  missingCount: Number(scanRow.missing_count ?? 0),
  newCount: Number(scanRow.new_count ?? 0),
  createdAt: formatDateTime(scanRow.created_at),
});

const getAndroidScanReport = async ({ scanId, branchId = null } = {}) => {
  const scanRow = scanId
    ? await fetchScanRow(scanId)
    : await fetchLatestScanRow(branchId);

  if (!scanRow) {
    throw new ApiError(404, "No stock verification scan found");
  }

  const activeBatchId = await getActiveBatchId(branchId);
  const [found, newItems, missing] = await Promise.all([
    fetchDetailCountsByProduct(scanRow.id, "FOUND"),
    fetchDetailCountsByProduct(scanRow.id, "NEW"),
    fetchMissingCountsByProduct(scanRow, activeBatchId),
  ]);

  return {
    scan: mapScanResponse(scanRow),
    summary: {
      found,
      new: newItems,
      missing,
    },
  };
};

export default {
  getAndroidScanReport,
};
