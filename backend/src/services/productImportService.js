import pool from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import { parseStockExcel } from '../utils/excelParser.js';
import { resolveActiveBatch } from '../services/productBatchService.js';
import importJobStore from './importJobStore.js';
import { refreshDailySalesSummary } from './dailySalesSummaryService.js';

const BATCH_SIZE = Math.max(
  500,
  Number.parseInt(process.env.IMPORT_BATCH_SIZE ?? '5000', 10) || 5000
);

const logImport = (message, meta = undefined) => {
  if (meta === undefined) {
    console.info(`[product-import] ${message}`);
    return;
  }

  console.info(`[product-import] ${message}`, meta);
};

const rowToValues = (batchId, row) => [
  batchId,
  row.barcode,
  row.item_description,
  row.closing_bal_qty,
];

const buildPlaceholders = (rowCount, columnCount) =>
  Array.from({ length: rowCount }, () => `(${Array(columnCount).fill('?').join(', ')})`).join(', ');

const dedupeRowsByBarcode = (rows) => {
  const byBarcode = new Map();

  for (const row of rows) {
    const barcode = String(row.barcode ?? '').trim();
    if (barcode) {
      byBarcode.set(barcode, row);
    }
  }

  return [...byBarcode.values()];
};

const enableBulkSession = async (connection) => {
  await connection.query(
    'SET SESSION foreign_key_checks = 0, unique_checks = 0'
  );

  try {
    await connection.query('SET SESSION sql_log_bin = 0');
  } catch {
    // Managed/replica MySQL may not allow changing sql_log_bin
  }
};

const disableBulkSession = async (connection) => {
  await connection.query(
    'SET SESSION foreign_key_checks = 1, unique_checks = 1'
  );

  try {
    await connection.query('SET SESSION sql_log_bin = 1');
  } catch {
    // Ignore restore errors on restricted MySQL users
  }
};

const bulkInsert = async (connection, batchId, rows) => {
  if (rows.length === 0) {
    return;
  }

  const placeholders = buildPlaceholders(rows.length, 4);
  const values = rows.flatMap((row) => rowToValues(batchId, row));

  await connection.query(
    `INSERT INTO products
      (batch_id, barcode, item_description, closing_bal_qty)
     VALUES ${placeholders}`,
    values
  );
};

const runChunked = async (rows, handler, onProgress, progressStart, progressEnd) => {
  if (rows.length === 0) {
    return;
  }

  const totalChunks = Math.ceil(rows.length / BATCH_SIZE);

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const chunk = rows.slice(index, index + BATCH_SIZE);
    await handler(chunk);

    if (onProgress) {
      const chunkIndex = Math.floor(index / BATCH_SIZE) + 1;
      const percent =
        progressStart +
        Math.round((chunkIndex / totalChunks) * (progressEnd - progressStart));
      onProgress({
        processed: Math.min(index + chunk.length, rows.length),
        total: rows.length,
        percent,
      });
    }
  }
};

const importProductsFromExcel = async (
  buffer,
  uploadedBy = null,
  { onProgress } = {}
) => {
  const reportProgress = (patch) => {
    if (onProgress) {
      onProgress(patch);
    }
  };

  reportProgress({ phase: 'parsing', progress: 5, message: 'Parsing Excel file' });

  const parseStartedAt = Date.now();
  logImport('excel parse started', {
    bufferBytes: Buffer.isBuffer(buffer) ? buffer.length : null,
  });

  let parsed;

  try {
    parsed = await parseStockExcel(buffer);
  } catch (error) {
    logImport('excel parse failed', {
      durationMs: Date.now() - parseStartedAt,
      error: error.message,
      stack: error.stack,
    });
    throw new ApiError(400, error.message);
  }

  const validRows = dedupeRowsByBarcode(parsed.validRows);
  const { totalRowsInFile, skipped } = parsed;

  logImport('excel parse completed', {
    durationMs: Date.now() - parseStartedAt,
    totalRowsInFile,
    validRows: validRows.length,
    skipped,
  });

  if (validRows.length === 0) {
    return {
      totalRowsInFile,
      skipped,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      batchId: null,
      isNewBatch: false,
    };
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await enableBulkSession(connection);

    reportProgress({
      phase: 'preparing',
      progress: 10,
      message: 'Preparing import batch',
      total: validRows.length,
      processed: 0,
    });

    const { batchId, isNewBatch, previousBatchId } = await resolveActiveBatch(
      connection,
      uploadedBy,
    );

    reportProgress({
      phase: 'inserting',
      progress: 15,
      message: 'Bulk inserting products',
      total: validRows.length,
      processed: 0,
    });

    const insertStartedAt = Date.now();
    logImport('bulk insert started', {
      batchId,
      previousBatchId,
      rows: validRows.length,
      batchSize: BATCH_SIZE,
    });

    await runChunked(
      validRows,
      (chunk) => bulkInsert(connection, batchId, chunk),
      ({ processed, total, percent }) =>
        reportProgress({
          phase: 'inserting',
          message: 'Bulk inserting products',
          progress: 15 + Math.round((percent / 100) * 75),
          processed,
          total,
        }),
      0,
      100,
    );

    const inserted = validRows.length;
    logImport('bulk insert completed', {
      batchId,
      inserted,
      durationMs: Date.now() - insertStartedAt,
    });

    await disableBulkSession(connection);
    await connection.commit();

    let salesSummary = null;

    reportProgress({
      phase: 'completed',
      progress: 100,
      message: 'Import completed',
      processed: validRows.length,
      total: validRows.length,
    });

    try {
      salesSummary = await refreshDailySalesSummary(batchId, connection);
    } catch (summaryError) {
      console.error('[product-import] daily sales summary refresh failed', {
        batchId,
        error: summaryError.message,
      });
    }

    logImport('import completed', {
      batchId,
      previousBatchId: salesSummary?.previousBatchId ?? previousBatchId,
      isNewBatch,
      totalRowsInFile,
      skipped,
      inserted,
      soldBarcodes: salesSummary?.soldBarcodes ?? 0,
      soldQty: salesSummary?.soldQty ?? 0,
      removedBarcodes: salesSummary?.removedBarcodes ?? 0,
      qtyReductions: salesSummary?.qtyReductions ?? 0,
    });

    return {
      batchId,
      previousBatchId: salesSummary?.previousBatchId ?? previousBatchId,
      isNewBatch,
      totalRowsInFile,
      skipped,
      inserted,
      updated: 0,
      unchanged: 0,
      soldBarcodes: salesSummary?.soldBarcodes ?? 0,
      soldQty: salesSummary?.soldQty ?? 0,
      removedBarcodes: salesSummary?.removedBarcodes ?? 0,
      qtyReductions: salesSummary?.qtyReductions ?? 0,
    };
  } catch (error) {
    await disableBulkSession(connection).catch(() => {});
    await connection.rollback();
    console.error('Product import failed:', error);
    throw error;
  } finally {
    connection.release();
  }
};

const startAsyncImport = (buffer, uploadedBy = null, meta = {}) => {
  const job = importJobStore.createJob();
  const fileBuffer = Buffer.isBuffer(buffer) ? Buffer.from(buffer) : buffer;

  logImport('async import queued', {
    jobId: job.id,
    uploadedBy,
    fileName: meta.fileName ?? null,
    fileSize: meta.fileSize ?? (Buffer.isBuffer(fileBuffer) ? fileBuffer.length : null),
  });

  setImmediate(async () => {
    importJobStore.updateJob(job.id, {
      status: 'processing',
      phase: 'starting',
      progress: 0,
      message: 'Import started',
    });

    try {
      const result = await importProductsFromExcel(fileBuffer, uploadedBy, {
        onProgress: ({
          phase,
          progress,
          message,
          processed = 0,
          total = 0,
        }) => {
          importJobStore.updateJob(job.id, {
            status: phase === 'completed' ? 'completed' : 'processing',
            phase,
            progress,
            message,
            processed,
            total,
          });
        },
      });

      importJobStore.updateJob(job.id, {
        status: 'completed',
        phase: 'completed',
        progress: 100,
        message: 'Import completed successfully',
        processed: result.inserted + result.updated + result.unchanged,
        total: result.inserted + result.updated + result.unchanged,
        result,
      });
    } catch (error) {
      const failureMessage = error?.message || 'Import failed';

      console.error('[product-import] async import failed', {
        jobId: job.id,
        error: failureMessage,
        stack: error?.stack,
      });

      importJobStore.updateJob(job.id, {
        status: 'failed',
        phase: 'failed',
        progress: 100,
        message: failureMessage,
        error: failureMessage,
      });
    }
  });

  return job;
};

const getImportJobStatus = (jobId) => importJobStore.getJob(jobId);

export default {
  importProductsFromExcel,
  startAsyncImport,
  getImportJobStatus,
};
