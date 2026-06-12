import pool from "../config/database.js";
import {
  rebuildBatchSalesAudit,
  countBatchStockQty,
} from "./batchSalesAuditService.js";

const ALL_COUNTER = "ALL";

const PRODUCT_BARCODE_FILTER = `
  barcode IS NOT NULL
  AND TRIM(barcode) != ''
`;

const formatLocalDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }

  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const logSummary = (message, meta = undefined) => {
  if (meta === undefined) {
    console.info(`[daily-sales-summary] ${message}`);
    return;
  }

  console.info(`[daily-sales-summary] ${message}`, meta);
};

const getBatchMeta = async (connection, batchId) => {
  const [rows] = await connection.execute(
    `SELECT id, batch_date
     FROM product_upload_batches
     WHERE id = ?`,
    [batchId],
  );

  return rows[0] ?? null;
};

const getPreviousBatchId = async (connection, batchId) => {
  const [rows] = await connection.execute(
    `SELECT id
     FROM product_upload_batches
     WHERE id < ?
     ORDER BY id DESC
     LIMIT 1`,
    [batchId],
  );

  return rows[0]?.id ?? null;
};

const countAllStock = async (connection, batchId) => {
  const [[row]] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM products
     WHERE batch_id = ?
       AND ${PRODUCT_BARCODE_FILTER}`,
    [batchId],
  );

  return Number(row.total ?? 0);
};

const deleteBatchSummaries = async (connection, batchId) => {
  await connection.execute(
    `DELETE FROM daily_sales_summary WHERE batch_id = ?`,
    [batchId],
  );
};

const insertSummaryRow = async (
  connection,
  {
    batchId,
    batchDate,
    totalStock,
    totalStockQty,
    soldBarcodes,
    soldQty,
  },
) => {
  await connection.execute(
    `INSERT INTO daily_sales_summary
      (batch_id, batch_date, counter_name, total_stock, total_stock_pieces,
       estimated_sold, sold_tags, sold_pieces)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      batchId,
      batchDate,
      ALL_COUNTER,
      totalStock,
      totalStockQty,
      soldQty,
      soldBarcodes,
      soldQty,
    ],
  );
};

export const refreshDailySalesSummary = async (batchId, connection = pool) => {
  const batch = await getBatchMeta(connection, batchId);

  if (!batch) {
    throw new Error(`Batch ${batchId} not found`);
  }

  const previousBatchId = await getPreviousBatchId(connection, batchId);
  const batchDate = formatLocalDateKey(batch.batch_date);

  const auditSummary = await rebuildBatchSalesAudit(
    connection,
    batchId,
    previousBatchId,
  );

  const currentAllTotal = await countAllStock(connection, batchId);
  const currentAllQty = await countBatchStockQty(connection, batchId);

  await deleteBatchSummaries(connection, batchId);

  await insertSummaryRow(connection, {
    batchId,
    batchDate,
    totalStock: currentAllTotal,
    totalStockQty: currentAllQty,
    soldBarcodes: auditSummary.soldBarcodes,
    soldQty: auditSummary.soldQty,
  });

  logSummary("summary refreshed", {
    batchId,
    batchDate,
    previousBatchId,
    allStock: currentAllTotal,
    allStockQty: currentAllQty,
    soldBarcodes: auditSummary.soldBarcodes,
    soldQty: auditSummary.soldQty,
    auditDurationMs: auditSummary.durationMs,
  });

  return {
    previousBatchId,
    soldBarcodes: auditSummary.soldBarcodes,
    soldQty: auditSummary.soldQty,
    removedBarcodes: auditSummary.removedBarcodes,
    qtyReductions: auditSummary.qtyReductions,
  };
};

export const backfillAllDailySalesSummaries = async () => {
  const [batches] = await pool.execute(
    `SELECT id FROM product_upload_batches ORDER BY id ASC`,
  );

  for (const batch of batches) {
    await refreshDailySalesSummary(batch.id);
  }

  logSummary("backfill completed", { batchCount: batches.length });
};

export const resolveCounterFilter = () => ALL_COUNTER;

export const validatePeriod = (periodParam) => {
  const period = String(periodParam ?? "week").trim().toLowerCase();

  if (period !== "week" && period !== "month") {
    return null;
  }

  return period;
};

export const validateDailyImportCounter = () => ALL_COUNTER;

export default {
  refreshDailySalesSummary,
  backfillAllDailySalesSummaries,
  resolveCounterFilter,
  validatePeriod,
  validateDailyImportCounter,
  ALL_COUNTER,
};
