import pool from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import { parseStockExcel } from '../utils/excelParser.js';
import { hasProductChanged } from '../utils/productBatchHelper.js';
import { resolveActiveBatch } from '../services/productBatchService.js';
import importJobStore from './importJobStore.js';

const BATCH_SIZE = 1000;

const PRODUCT_FIELDS = [
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
  const [rows] = await connection.execute(
    `SELECT id, ${PRODUCT_FIELDS.join(', ')}
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

const runChunked = async (rows, handler, onProgress, progressStart, progressEnd) => {
  const totalChunks = Math.ceil(rows.length / BATCH_SIZE) || 1;

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

  const { validRows, totalRowsInFile, skipped } = parsed;

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

    const existingMap = await loadExistingProducts(connection, batchId);
    const isFirstImport = existingMap.size === 0;

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    if (isFirstImport) {
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
    } else {
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
      fastPath: isFirstImport,
    };
  } catch (error) {
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
