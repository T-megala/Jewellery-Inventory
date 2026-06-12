import pool from '../src/config/database.js';
import { refreshDailySalesSummary } from '../src/services/dailySalesSummaryService.js';
import { benchmarkBatchComparison } from '../src/services/batchSalesAuditService.js';

const [batches] = await pool.execute(
  `SELECT id FROM product_upload_batches ORDER BY id DESC LIMIT 2`,
);

if (batches.length < 2) {
  console.log('Need at least 2 batches to benchmark.');
  process.exit(1);
}

const currentBatchId = batches[0].id;
const previousBatchId = batches[1].id;

console.log('Comparing batches', { previousBatchId, currentBatchId });

const comparison = await benchmarkBatchComparison(previousBatchId, currentBatchId);
console.log('Comparison benchmark:', comparison);

const summaryStartedAt = Date.now();
await refreshDailySalesSummary(currentBatchId);
const summaryDurationMs = Date.now() - summaryStartedAt;

const [[auditStats]] = await pool.execute(
  `SELECT
     COUNT(*) AS auditRows,
     COALESCE(SUM(sold_barcodes), 0) AS soldBarcodes,
     COALESCE(SUM(sold_qty), 0) AS soldQty
   FROM inventory_sales_audit
   WHERE batch_id = ?`,
  [currentBatchId],
);

const [[summaryRow]] = await pool.execute(
  `SELECT total_stock, total_stock_pieces, sold_tags, sold_pieces
   FROM daily_sales_summary
   WHERE batch_id = ? AND counter_name = 'ALL'`,
  [currentBatchId],
);

console.log({
  summaryRefreshDurationMs: summaryDurationMs,
  auditRows: Number(auditStats.auditRows),
  soldBarcodes: Number(auditStats.soldBarcodes),
  soldQty: Number(auditStats.soldQty),
  summaryRow,
  estimatedAddedImportOverheadMs: comparison.totalDurationMs,
});

await pool.end();
