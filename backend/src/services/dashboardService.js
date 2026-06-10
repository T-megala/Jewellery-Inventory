import pool from "../config/database.js";
import { getActiveBatchId } from "./productBatchService.js";

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

const emptyTotals = () => ({
  totalTags: 0,
  totalPieces: 0,
  totalGrossWt: 0,
  totalNetWt: 0,
  productGroups: 0,
  subProducts: 0,
  counters: 0,
});

const getBatchInfo = async (batchId) => {
  const [rows] = await pool.execute(
    `SELECT id, batch_date, uploaded_at, uploaded_by, is_active
     FROM product_upload_batches
     WHERE id = ?`,
    [batchId],
  );

  if (!rows.length) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    batchDate: formatDate(row.batch_date),
    uploadedAt: formatDateTime(row.uploaded_at),
    uploadedBy: row.uploaded_by,
    isActive: Boolean(row.is_active),
  };
};

const getInventorySummary = async () => {
  const batchId = await getActiveBatchId();

  if (!batchId) {
    return {
      batch: null,
      totals: emptyTotals(),
      byProduct: [],
      byCounter: [],
      recentTags: [],
    };
  }

  const batch = await getBatchInfo(batchId);
  const baseWhere = `batch_id = ?
    AND tag_packet_no IS NOT NULL
    AND TRIM(tag_packet_no) != ''`;
  const counterNameExpr = `CASE
    WHEN counter_name IS NULL OR TRIM(counter_name) = '' THEN 'Unassigned'
    ELSE TRIM(counter_name)
  END`;

  const [[totalsRow]] = await pool.execute(
    `SELECT
       COUNT(*) AS totalTags,
       COALESCE(SUM(pieces), 0) AS totalPieces,
       COALESCE(SUM(gross_wt), 0) AS totalGrossWt,
       COALESCE(SUM(net_wt), 0) AS totalNetWt,
       COUNT(DISTINCT product) AS productGroups,
       COUNT(DISTINCT CONCAT(product, '|', sub_product)) AS subProducts,
       COUNT(DISTINCT ${counterNameExpr}) AS counters
     FROM products
     WHERE ${baseWhere}`,
    [batchId],
  );

  const [byProductRows] = await pool.execute(
    `SELECT
       product AS name,
       COUNT(DISTINCT sub_product) AS subProductCount,
       COUNT(*) AS tagCount
     FROM products
     WHERE ${baseWhere}
     GROUP BY product
     ORDER BY subProductCount DESC, product ASC`,
    [batchId],
  );

  const [byCounterRows] = await pool.execute(
    `SELECT
       ${counterNameExpr} AS name,
       COUNT(DISTINCT CONCAT(product, '|', sub_product)) AS subProductCount,
       COUNT(DISTINCT product) AS productCount,
       COUNT(*) AS tagCount
     FROM products
     WHERE ${baseWhere}
     GROUP BY ${counterNameExpr}
     ORDER BY subProductCount DESC, name ASC`,
    [batchId],
  );

  const [recentRows] = await pool.execute(
    `SELECT
       id,
       product,
       sub_product AS subProduct,
       counter_name AS counterName,
       tag_packet_no AS tagPacketNo
     FROM products
     WHERE batch_id = ?
     ORDER BY id DESC
     LIMIT 10`,
    [batchId],
  );

  return {
    batch,
    totals: {
      totalTags: Number(totalsRow.totalTags ?? 0),
      totalPieces: Number(totalsRow.totalPieces ?? 0),
      totalGrossWt: Number(totalsRow.totalGrossWt ?? 0),
      totalNetWt: Number(totalsRow.totalNetWt ?? 0),
      productGroups: Number(totalsRow.productGroups ?? 0),
      subProducts: Number(totalsRow.subProducts ?? 0),
      counters: Number(totalsRow.counters ?? 0),
    },
    byProduct: byProductRows.map((row) => ({
      name: row.name,
      subProductCount: Number(row.subProductCount ?? 0),
      tagCount: Number(row.tagCount ?? 0),
    })),
    byCounter: byCounterRows.map((row) => ({
      name: row.name,
      subProductCount: Number(row.subProductCount ?? 0),
      productCount: Number(row.productCount ?? 0),
      tagCount: Number(row.tagCount ?? 0),
    })),
    recentTags: recentRows.map((row) => ({
      id: row.id,
      product: row.product,
      subProduct: row.subProduct,
      counterName: row.counterName,
      tagPacketNo: row.tagPacketNo,
    })),
  };
};

const getVerificationSummary = async () => {
  const [rows] = await pool.execute(
    `SELECT
       SUM(CASE WHEN status = 'FOUND' THEN 1 ELSE 0 END) AS foundCount,
       SUM(CASE WHEN status = 'MISSING' THEN 1 ELSE 0 END) AS missingCount,
       SUM(CASE WHEN status = 'NEW' THEN 1 ELSE 0 END) AS newCount,
       COUNT(*) AS totalRecords
     FROM stock_verification_details`,
  );

  const row = rows[0] ?? {};

  return {
    totalFound: Number(row.foundCount ?? 0),
    totalMissing: Number(row.missingCount ?? 0),
    totalNew: Number(row.newCount ?? 0),
    totalTags: Number(row.totalRecords ?? 0),
  };
};

const getDashboard = async () => {
  const [inventory, verification] = await Promise.all([
    getInventorySummary(),
    getVerificationSummary(),
  ]);

  return {
    inventory,
    verification,
  };
};

export default {
  getInventorySummary,
  getVerificationSummary,
  getDashboard,
};
