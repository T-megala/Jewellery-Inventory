import pool from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import { parseStockExcel } from '../utils/excelParser.js';
import { resolveActiveBatch } from '../services/productBatchService.js';
import importJobStore from './importJobStore.js';
import { refreshDailySalesSummary } from './dailySalesSummaryService.js';

const BATCH_SIZE = Math.max(
  500,
  Number.parseInt(process.env.IMPORT_BATCH_SIZE ?? '5000', 10) || 5000,
);

const DEFER_POST_PROCESSING =
  process.env.IMPORT_DEFER_POST_PROCESSING !== 'false';

const logImport = (message, meta = undefined) => {
  if (meta === undefined) {
    console.info(`[product-import] ${message}`);
    return;
  }

  console.info(`[product-import] ${message}`, meta);
};

const rowToValues = (batchId, row) => [
  batchId,
  row.tran_no,
  row.tran_date,
  row.product,
  row.sub_product,
  row.tag_packet_no,
  row.pieces,
  row.gross_wt,
  row.net_wt,
  row.counter_name,
  row.size,
  row.tag_type,
  row.item_pieces,
  row.weight_gram,
  row.weight_carat,
];

const buildPlaceholders = (rowCount, columnCount) =>
  Array.from({ length: rowCount }, () => `(${Array(columnCount).fill('?').join(', ')})`).join(', ');

const dedupeRowsByTag = (rows) => {
  const byTag = new Map();

  for (const row of rows) {
    const tag = String(row.tag_packet_no ?? '').trim();
    if (tag) {
      byTag.set(tag, row);
    }
  }

  return [...byTag.values()];
};

/** Keep unique_checks enabled so uk_batch_tag prevents duplicate tags. */
const enableBulkSession = async (connection) => {
  await connection.query('SET SESSION foreign_key_checks = 0');

  try {
    await connection.query('SET SESSION sql_log_bin = 0');
  } catch {
    // Managed/replica MySQL may not allow changing sql_log_bin
  }
};

const disableBulkSession = async (connection) => {
  await connection.query('SET SESSION foreign_key_checks = 1');

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

  const deduped = dedupeRowsByTag(rows);
  if (deduped.length === 0) {
    return;
  }

  const placeholders = buildPlaceholders(deduped.length, 15);
  const values = deduped.flatMap((row) => rowToValues(batchId, row));

  await connection.query(
    `INSERT INTO products
      (batch_id, tran_no, tran_date, product, sub_product, tag_packet_no,
       pieces, gross_wt, net_wt, counter_name, size, tag_type,
       item_pieces, weight_gram, weight_carat)
     VALUES ${placeholders}`,
    values,
  );

  return deduped.length;
};

const runChunked = async (rows, handler, onProgress, progressStart, progressEnd) => {
  if (rows.length === 0) {
    return 0;
  }

  const totalChunks = Math.ceil(rows.length / BATCH_SIZE);
  let inserted = 0;

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const chunk = rows.slice(index, index + BATCH_SIZE);
    inserted += (await handler(chunk)) ?? 0;

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

  return inserted;
};

const schedulePostProcessing = (batchId, defer = DEFER_POST_PROCESSING) => {
  const run = () =>
    refreshDailySalesSummary(batchId).catch((error) => {
      console.error('[product-import] daily sales summary refresh failed', {
        batchId,
        error: error.message,
      });
    });

  if (defer) {
    setImmediate(run);
    logImport('post-processing scheduled in background', { batchId });
    return { deferred: true };
  }

  return run();
};

const importProductsFromExcel = async (
  buffer,
  uploadedBy = null,
  { onProgress, deferPostProcessing = DEFER_POST_PROCESSING } = {},
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

  const validRows = dedupeRowsByTag(parsed.validRows);
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
      previousBatchId: null,
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

    const inserted = await runChunked(
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

    await disableBulkSession(connection);
    await connection.commit();

    logImport('bulk insert completed', {
      batchId,
      previousBatchId,
      inserted,
      durationMs: Date.now() - insertStartedAt,
    });

    reportProgress({
      phase: 'completed',
      progress: 100,
      message: 'Import completed',
      processed: validRows.length,
      total: validRows.length,
    });

    logImport('import completed', {
      batchId,
      previousBatchId,
      isNewBatch,
      totalRowsInFile,
      skipped,
      inserted,
    });

    schedulePostProcessing(batchId, deferPostProcessing);

    return {
      batchId,
      previousBatchId,
      isNewBatch,
      totalRowsInFile,
      skipped,
      inserted,
      updated: 0,
      unchanged: 0,
      validRows: validRows.length,
      postProcessingDeferred: deferPostProcessing,
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

  logImport('async import queued', {
    jobId: job.id,
    uploadedBy,
    fileName: meta.fileName ?? null,
    fileSize: meta.fileSize ?? (Buffer.isBuffer(buffer) ? buffer.length : null),
  });

  setImmediate(async () => {
    importJobStore.updateJob(job.id, {
      status: 'processing',
      phase: 'starting',
      progress: 0,
      message: 'Import started',
    });

    try {
      const result = await importProductsFromExcel(buffer, uploadedBy, {
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
        processed: result.validRows ?? result.inserted,
        total: result.validRows ?? result.inserted,
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
