import pool from "../config/database.js";

const prevBarcodeFilter = `
  prev.barcode IS NOT NULL
  AND TRIM(prev.barcode) != ''
`;

const plainBarcodeFilter = `
  barcode IS NOT NULL
  AND TRIM(barcode) != ''
`;

const toQtyInt = (value) => Math.max(0, Math.round(Number(value ?? 0) * 1000) / 1000);

const logAudit = (message, meta = undefined) => {
  if (meta === undefined) {
    console.info(`[batch-sales-audit] ${message}`);
    return;
  }

  console.info(`[batch-sales-audit] ${message}`, meta);
};

export const deleteBatchSalesAudit = async (connection, batchId) => {
  await connection.execute(`DELETE FROM inventory_sales_audit WHERE batch_id = ?`, [
    batchId,
  ]);
};

const insertRemovedBarcodeAudits = async (
  connection,
  batchId,
  previousBatchId,
  currentBatchId,
) => {
  const [result] = await connection.execute(
    `INSERT INTO inventory_sales_audit
      (batch_id, previous_batch_id, barcode, item_description,
       sale_type, previous_qty, current_qty, sold_qty, sold_barcodes)
     SELECT
       ?,
       ?,
       TRIM(prev.barcode),
       prev.item_description,
       'BARCODE_REMOVED',
       prev.closing_bal_qty,
       NULL,
       COALESCE(prev.closing_bal_qty, 0),
       1
     FROM products prev
     LEFT JOIN products curr
       ON curr.batch_id = ?
      AND curr.barcode = prev.barcode
     WHERE prev.batch_id = ?
       AND ${prevBarcodeFilter}
       AND curr.id IS NULL`,
    [batchId, previousBatchId, currentBatchId, previousBatchId],
  );

  return Number(result.affectedRows ?? 0);
};

const insertQtyReductionAudits = async (
  connection,
  batchId,
  previousBatchId,
  currentBatchId,
) => {
  const [result] = await connection.execute(
    `INSERT INTO inventory_sales_audit
      (batch_id, previous_batch_id, barcode, item_description,
       sale_type, previous_qty, current_qty, sold_qty, sold_barcodes)
     SELECT
       ?,
       ?,
       TRIM(prev.barcode),
       prev.item_description,
       'QTY_REDUCTION',
       prev.closing_bal_qty,
       curr.closing_bal_qty,
       COALESCE(prev.closing_bal_qty, 0) - COALESCE(curr.closing_bal_qty, 0),
       0
     FROM products prev
     INNER JOIN products curr
       ON curr.batch_id = ?
      AND curr.barcode = prev.barcode
     WHERE prev.batch_id = ?
       AND ${prevBarcodeFilter}
       AND COALESCE(prev.closing_bal_qty, 0) > COALESCE(curr.closing_bal_qty, 0)`,
    [batchId, previousBatchId, currentBatchId, previousBatchId],
  );

  return Number(result.affectedRows ?? 0);
};

export const rebuildBatchSalesAudit = async (
  connection,
  batchId,
  previousBatchId,
) => {
  if (!previousBatchId) {
    await deleteBatchSalesAudit(connection, batchId);
    return {
      removedBarcodes: 0,
      qtyReductions: 0,
      soldBarcodes: 0,
      soldQty: 0,
      durationMs: 0,
    };
  }

  const startedAt = Date.now();

  await deleteBatchSalesAudit(connection, batchId);

  const removedBarcodes = await insertRemovedBarcodeAudits(
    connection,
    batchId,
    previousBatchId,
    batchId,
  );
  const qtyReductions = await insertQtyReductionAudits(
    connection,
    batchId,
    previousBatchId,
    batchId,
  );

  const [[totals]] = await connection.execute(
    `SELECT
       COALESCE(SUM(sold_barcodes), 0) AS soldBarcodes,
       COALESCE(SUM(sold_qty), 0) AS soldQty
     FROM inventory_sales_audit
     WHERE batch_id = ?`,
    [batchId],
  );

  const summary = {
    removedBarcodes,
    qtyReductions,
    soldBarcodes: Number(totals.soldBarcodes ?? 0),
    soldQty: toQtyInt(totals.soldQty),
    durationMs: Date.now() - startedAt,
  };

  logAudit("audit rebuilt", { batchId, previousBatchId, ...summary });

  return summary;
};

export const countBatchStockQty = async (connection, batchId) => {
  const [[row]] = await connection.execute(
    `SELECT COALESCE(SUM(COALESCE(closing_bal_qty, 0)), 0) AS totalQty
     FROM products
     WHERE batch_id = ?
       AND ${plainBarcodeFilter}`,
    [batchId],
  );

  return toQtyInt(row.totalQty);
};

export const benchmarkBatchComparison = async (previousBatchId, currentBatchId) => {
  const connection = await pool.getConnection();

  try {
    const startedAt = Date.now();
    await deleteBatchSalesAudit(connection, currentBatchId);
    const removedBarcodes = await insertRemovedBarcodeAudits(
      connection,
      currentBatchId,
      previousBatchId,
      currentBatchId,
    );
    const qtyReductions = await insertQtyReductionAudits(
      connection,
      currentBatchId,
      previousBatchId,
      currentBatchId,
    );
    const auditDurationMs = Date.now() - startedAt;

    return {
      previousBatchId,
      currentBatchId,
      removedBarcodes,
      qtyReductions,
      auditDurationMs,
      totalDurationMs: auditDurationMs,
    };
  } finally {
    connection.release();
  }
};

export default {
  rebuildBatchSalesAudit,
  deleteBatchSalesAudit,
  countBatchStockQty,
  benchmarkBatchComparison,
};
