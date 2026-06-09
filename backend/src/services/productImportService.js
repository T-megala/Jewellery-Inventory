import pool from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import { parseStockExcel } from '../utils/excelParser.js';
import { hasProductChanged } from '../utils/productBatchHelper.js';
import { resolveActiveBatch } from '../services/productBatchService.js';
import importJobStore from './importJobStore.js';

const BATCH_SIZE = Math.max(
  500,
  Number.parseInt(process.env.IMPORT_BATCH_SIZE ?? '3000', 10) || 3000
);

const FAST_REIMPORT_THRESHOLD = Math.max(
  1000,
  Number.parseInt(process.env.IMPORT_FAST_REIMPORT_THRESHOLD ?? '3000', 10) || 3000
);

const COMPARE_FIELDS = [
  'tran_no',
  'tran_date',
  'product',
  'sub_product',
  'tag_packet_no',
  'pieces',
  'gross_wt',
  'net_wt',
  'counter_name',
  'size',
  'tag_type',
  'item_pieces',
  'weight_gram',
  'weight_carat',
];

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

  const placeholders = buildPlaceholders(rows.length, 15);
  const values = rows.flatMap((row) => rowToValues(batchId, row));

  await connection.query(
    `INSERT INTO products
      (batch_id, tran_no, tran_date, product, sub_product, tag_packet_no,
       pieces, gross_wt, net_wt, counter_name, size, tag_type,
       item_pieces, weight_gram, weight_carat)
     VALUES ${placeholders}`,
    values
  );
};

const bulkUpsert = async (connection, batchId, rows) => {
  if (rows.length === 0) {
    return;
  }

  const placeholders = buildPlaceholders(rows.length, 15);
  const values = rows.flatMap((row) => rowToValues(batchId, row));

  await connection.query(
    `INSERT INTO products
      (batch_id, tran_no, tran_date, product, sub_product, tag_packet_no,
       pieces, gross_wt, net_wt, counter_name, size, tag_type,
       item_pieces, weight_gram, weight_carat)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       tran_no = VALUES(tran_no),
       tran_date = VALUES(tran_date),
       product = VALUES(product),
       sub_product = VALUES(sub_product),
       pieces = VALUES(pieces),
       gross_wt = VALUES(gross_wt),
       net_wt = VALUES(net_wt),
       counter_name = VALUES(counter_name),
       size = VALUES(size),
       tag_type = VALUES(tag_type),
       item_pieces = VALUES(item_pieces),
       weight_gram = VALUES(weight_gram),
       weight_carat = VALUES(weight_carat)`,
    values
  );
};

const loadExistingProducts = async (connection, batchId) => {
  const [rows] = await connection.query(
    `SELECT ${COMPARE_FIELDS.join(', ')}
     FROM products
     WHERE batch_id = ?`,
    [batchId]
  );

  const map = new Map();

  for (const row of rows) {
    const tag = String(row.tag_packet_no ?? '').trim();
    if (tag) {
      map.set(tag, row);
    }
  }

  return map;
};

const loadExistingTags = async (connection, batchId) => {
  const [rows] = await connection.query(
    `SELECT tag_packet_no
     FROM products
     WHERE batch_id = ?
       AND tag_packet_no IS NOT NULL
       AND TRIM(tag_packet_no) != ''`,
    [batchId]
  );

  return new Set(
    rows.map((row) => String(row.tag_packet_no).trim()).filter(Boolean)
  );
};

const classifyRows = (validRows, existingMap) => {
  const toInsert = [];
  const toUpsert = [];
  let unchanged = 0;

  for (const row of validRows) {
    const tag = String(row.tag_packet_no).trim();
    const existing = existingMap.get(tag);

    if (!existing) {
      toInsert.push(row);
      continue;
    }

    if (hasProductChanged(existing, row)) {
      toUpsert.push(row);
    } else {
      unchanged += 1;
    }
  }

  return { toInsert, toUpsert, unchanged };
};

const countInsertVsExisting = (validRows, existingTags) => {
  let inserted = 0;
  let updated = 0;

  for (const row of validRows) {
    const tag = String(row.tag_packet_no).trim();
    if (existingTags.has(tag)) {
      updated += 1;
    } else {
      inserted += 1;
    }
  }

  return { inserted, updated };
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

  let parsed;

  try {
    parsed = parseStockExcel(buffer);
  } catch (error) {
    throw new ApiError(400, error.message);
  }

  const validRows = dedupeRowsByTag(parsed.validRows);
  const { totalRowsInFile, skipped } = parsed;

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

    const { batchId, isNewBatch } = await resolveActiveBatch(
      connection,
      uploadedBy
    );

    const existingTags = await loadExistingTags(connection, batchId);
    const isFirstImport = existingTags.size === 0;
    const useFastReimport =
      !isFirstImport &&
      !isNewBatch &&
      validRows.length >= FAST_REIMPORT_THRESHOLD;

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let fastPath = false;
    let fastReimport = false;

    if (isFirstImport) {
      fastPath = true;

      reportProgress({
        phase: 'inserting',
        progress: 15,
        message: 'Bulk inserting products',
        total: validRows.length,
        processed: 0,
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
        100
      );

      inserted = validRows.length;
    } else if (useFastReimport) {
      fastReimport = true;

      reportProgress({
        phase: 'upserting',
        progress: 15,
        message: 'Fast bulk upserting products',
        total: validRows.length,
        processed: 0,
      });

      await runChunked(
        validRows,
        (chunk) => bulkUpsert(connection, batchId, chunk),
        ({ processed, total, percent }) =>
          reportProgress({
            phase: 'upserting',
            message: 'Fast bulk upserting products',
            progress: 15 + Math.round((percent / 100) * 75),
            processed,
            total,
          }),
        0,
        100
      );

      const counts = countInsertVsExisting(validRows, existingTags);
      inserted = counts.inserted;
      updated = counts.updated;
    } else {
      const existingMap = await loadExistingProducts(connection, batchId);
      const classified = classifyRows(validRows, existingMap);
      const { toInsert, toUpsert } = classified;
      unchanged = classified.unchanged;
      inserted = toInsert.length;
      updated = toUpsert.length;

      const writeRows = [...toInsert, ...toUpsert];

      reportProgress({
        phase: 'upserting',
        progress: 15,
        message: 'Bulk upserting products',
        total: writeRows.length,
        processed: 0,
      });

      if (writeRows.length > 0) {
        await runChunked(
          writeRows,
          (chunk) => bulkUpsert(connection, batchId, chunk),
          ({ processed, total, percent }) =>
            reportProgress({
              phase: 'upserting',
              message: 'Bulk upserting products',
              progress: 15 + Math.round((percent / 100) * 75),
              processed,
              total,
            }),
          0,
          100
        );
      } else {
        reportProgress({
          phase: 'complete',
          progress: 100,
          message: 'No database changes required',
          processed: validRows.length,
          total: validRows.length,
        });
      }
    }

    await disableBulkSession(connection);
    await connection.commit();

    reportProgress({
      phase: 'completed',
      progress: 100,
      message: 'Import completed',
      processed: validRows.length,
      total: validRows.length,
    });

    return {
      batchId,
      isNewBatch,
      totalRowsInFile,
      skipped,
      inserted,
      updated,
      unchanged,
      fastPath,
      fastReimport,
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

const startAsyncImport = (buffer, uploadedBy = null) => {
  const job = importJobStore.createJob();

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
        processed: result.inserted + result.updated + result.unchanged,
        total: result.inserted + result.updated + result.unchanged,
        result,
      });
    } catch (error) {
      importJobStore.updateJob(job.id, {
        status: 'failed',
        phase: 'failed',
        progress: 100,
        message: error.isOperational ? error.message : 'Import failed',
        error: error.isOperational ? error.message : 'Import failed',
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
