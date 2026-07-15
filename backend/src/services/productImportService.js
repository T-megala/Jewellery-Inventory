import pool from '../config/database.js';
import { resolveOperationalBranchId } from '../utils/branchRequest.js';
import ApiError from '../utils/ApiError.js';
import { parseStockExcel } from '../utils/excelParser.js';
import {
  getActiveBatchId,
  resolveActiveBatch,
} from '../services/productBatchService.js';
import importJobStore from './importJobStore.js';
import { refreshDailySalesSummary } from './dailySalesSummaryService.js';
import {
  IMPORT_MODES,
  VALID_IMPORT_MODES,
} from '../config/productImportColumnMapping.js';
import {
  applyGroupHeaderInheritance,
  buildTaggedRowKey,
  enrichRecordFromProductCodes,
  flattenToLegacyProductRow,
  sanitizePrintRatePricing,
} from '../utils/productImportMapper.js';
import {
  appendImportError,
  appendImportSkip,
  buildImportSkipEntry,
  countRowTypes,
  createDuplicateTracker,
  createImportSummary,
  SKIP_REASONS,
  validateProductRecord,
} from '../utils/productImportValidator.js';
import {
  bulkInsertNormalizedDetails,
  bulkUpsertNormalizedDetails,
} from './productNormalizedRepository.js';
import erpProductCodeService from './erpProductCodeService.js';
import { createFileLogger } from '../utils/fileLogger.js';

const importLogger = createFileLogger('product-import');

const BATCH_SIZE = Math.max(
  500,
  Number.parseInt(process.env.IMPORT_BATCH_SIZE ?? '2000', 10) || 2000,
);

const DEFER_POST_PROCESSING =
  process.env.IMPORT_DEFER_POST_PROCESSING !== 'false';

const logImport = (message, meta = undefined) => {
  importLogger.info(message, meta);
};

const logSkippedRows = (phase, { skipped, skippedRows }) => {
  if (!skipped) {
    return;
  }

  logImport(`${phase}: ${skipped} row(s) skipped`, {
    skipped,
    sampleSkippedRows: skippedRows.slice(0, 20),
  });
};

const describeUpdateModeSkip = (tagKey, barcode) => {
  if (!tagKey && !barcode) {
    return {
      reason: SKIP_REASONS.NO_MATCH_IDENTIFIER,
      message:
        'Update mode requires an existing tag or barcode to match; this row has neither',
    };
  }

  const identifiers = [
    tagKey ? `tag "${tagKey}"` : null,
    barcode ? `barcode "${barcode}"` : null,
  ].filter(Boolean);

  return {
    reason: SKIP_REASONS.NOT_FOUND_IN_BATCH,
    message: `No product with ${identifiers.join(' or ')} found in the active batch`,
  };
};

const PRODUCT_INSERT_COLUMNS = [
  'batch_id',
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

const rowToProductValues = (batchId, legacyRow) => [
  batchId,
  legacyRow.tran_no,
  legacyRow.tran_date,
  legacyRow.product,
  legacyRow.sub_product,
  legacyRow.tag_packet_no,
  legacyRow.pieces,
  legacyRow.gross_wt,
  legacyRow.net_wt,
  legacyRow.counter_name,
  legacyRow.size,
  legacyRow.tag_type,
  legacyRow.item_pieces,
  legacyRow.weight_gram,
  legacyRow.weight_carat,
];

const syncTagDetails = (record) => {
  const products = record.products ?? {};
  const tagDetails = { ...(record.product_tag_details ?? {}) };

  if (!tagDetails.tag_no && products.tag_packet_no) {
    tagDetails.tag_no = products.tag_packet_no;
  }

  if (!products.tag_packet_no && tagDetails.tag_no) {
    products.tag_packet_no = tagDetails.tag_no;
  }

  record.products = products;
  record.product_tag_details = tagDetails;
};

const enableBulkSession = async (connection) => {
  await connection.query('SET SESSION foreign_key_checks = 0');
  await connection.query('SET SESSION unique_checks = 0');

  try {
    await connection.query('SET SESSION sql_log_bin = 0');
  } catch {
    // Managed/replica MySQL may not allow changing sql_log_bin
  }
};

const disableBulkSession = async (connection) => {
  await connection.query('SET SESSION unique_checks = 1');
  await connection.query('SET SESSION foreign_key_checks = 1');

  try {
    await connection.query('SET SESSION sql_log_bin = 1');
  } catch {
    // Ignore restore errors on restricted MySQL users
  }
};

const resolveImportBatch = async (
  connection,
  branchId,
  uploadedBy,
  importMode,
) => {
  if (importMode === IMPORT_MODES.INSERT) {
    return resolveActiveBatch(connection, branchId, uploadedBy);
  }

  const activeBatchId = await getActiveBatchId(branchId, connection);

  if (activeBatchId) {
    return {
      batchId: activeBatchId,
      isNewBatch: false,
      previousBatchId: null,
      branchId,
    };
  }

  return resolveActiveBatch(connection, branchId, uploadedBy);
};

const loadExistingTagMap = async (connection, batchId) => {
  const [rows] = await connection.query(
    `SELECT id, tag_packet_no
     FROM products
     WHERE batch_id = ?
       AND tag_packet_no IS NOT NULL
       AND TRIM(tag_packet_no) != ''`,
    [batchId],
  );

  const byTag = new Map();
  const byBarcode = new Map();

  for (const row of rows) {
    byTag.set(buildTaggedRowKey({ tag_packet_no: row.tag_packet_no }), row.id);
  }

  const [barcodeRows] = await connection.query(
    `SELECT ptd.product_id, ptd.barcode
     FROM product_tag_details ptd
     INNER JOIN products p ON p.id = ptd.product_id
     WHERE p.batch_id = ?
       AND ptd.barcode IS NOT NULL
       AND TRIM(ptd.barcode) != ''`,
    [batchId],
  );

  for (const row of barcodeRows) {
    byBarcode.set(String(row.barcode).trim().toUpperCase(), row.product_id);
  }

  return { byTag, byBarcode };
};

const processParsedRows = (parsedRows, productCodeLookup = null) => {
  const summary = createImportSummary();
  const duplicateTracker = createDuplicateTracker();
  const validRows = [];
  const rowsWithInheritedPricing = applyGroupHeaderInheritance(parsedRows);

  summary.totalRecords = rowsWithInheritedPricing.length;

  for (const { record, rowNumber } of rowsWithInheritedPricing) {
    enrichRecordFromProductCodes(record, productCodeLookup);
    syncTagDetails(record);
    sanitizePrintRatePricing(record);

    const validation = validateProductRecord(record, rowNumber);

    if (validation.skip) {
      appendImportSkip(
        summary,
        buildImportSkipEntry({
          rowNumber,
          reason: validation.reason,
          message: validation.message,
          legacy: flattenToLegacyProductRow(record),
          record,
        }),
      );
      continue;
    }

    if (!validation.valid) {
      for (const error of validation.errors) {
        appendImportError(summary, error);
      }
      continue;
    }

    const duplicateErrors = duplicateTracker.check(record, rowNumber);
    if (duplicateErrors.length > 0) {
      summary.duplicateRecords += 1;
      for (const error of duplicateErrors) {
        appendImportError(summary, error);
      }
      continue;
    }

    const legacy = validation.legacy;
    const rowType = countRowTypes(legacy);

    if (rowType === 'tagged') {
      summary.taggedRows += 1;
    } else {
      summary.untaggedRows += 1;
    }

    validRows.push({ record, legacy, rowNumber });
  }

  return { validRows, summary };
};

const bulkInsertProducts = async (connection, batchId, rows) => {
  if (rows.length === 0) {
    return { inserted: 0, productIds: [] };
  }

  const values = rows.map(({ legacy }) => rowToProductValues(batchId, legacy));

  const [result] = await connection.query(
    `INSERT INTO products (${PRODUCT_INSERT_COLUMNS.join(', ')}) VALUES ?`,
    [values],
  );

  const firstId = Number(result.insertId);
  const count = Number(result.affectedRows);
  const productIds = Array.from({ length: count }, (_, index) => firstId + index);

  return { inserted: count, productIds };
};

const PRODUCT_UPDATE_COLUMNS = [
  'id',
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

const PRODUCT_UPDATE_ASSIGNMENTS = PRODUCT_UPDATE_COLUMNS
  .filter((column) => column !== 'id')
  .map((column) => `${column} = VALUES(${column})`)
  .join(', ');

const bulkUpdateProducts = async (connection, rows) => {
  if (rows.length === 0) {
    return 0;
  }

  const updateValues = rows.map(({ productId, legacy }) => [
    productId,
    legacy.tran_no,
    legacy.tran_date,
    legacy.product,
    legacy.sub_product,
    legacy.tag_packet_no,
    legacy.pieces,
    legacy.gross_wt,
    legacy.net_wt,
    legacy.counter_name,
    legacy.size,
    legacy.tag_type,
    legacy.item_pieces,
    legacy.weight_gram,
    legacy.weight_carat,
  ]);

  await connection.query(
    `INSERT INTO products (${PRODUCT_UPDATE_COLUMNS.join(', ')}) VALUES ?
     ON DUPLICATE KEY UPDATE ${PRODUCT_UPDATE_ASSIGNMENTS}`,
    [updateValues],
  );

  return rows.length;
};

const classifyRowsForMode = async (
  connection,
  batchId,
  rows,
  importMode,
  summary,
) => {
  const toInsert = [];
  const toUpdate = [];

  if (importMode === IMPORT_MODES.INSERT) {
    return { toInsert: rows, toUpdate: [] };
  }

  const { byTag, byBarcode } = await loadExistingTagMap(connection, batchId);

  for (const row of rows) {
    const tagKey = buildTaggedRowKey(row.legacy);
    const barcode = String(row.record.product_tag_details?.barcode ?? '').trim().toUpperCase();

    let existingId = tagKey ? byTag.get(tagKey) : null;

    if (!existingId && barcode) {
      existingId = byBarcode.get(barcode) ?? null;
    }

    if (existingId) {
      if (importMode === IMPORT_MODES.UPDATE) {
        toUpdate.push({ ...row, productId: existingId });
      } else {
        toUpdate.push({ ...row, productId: existingId });
      }
      continue;
    }

    if (importMode === IMPORT_MODES.UPDATE) {
      const { reason, message } = describeUpdateModeSkip(tagKey, barcode);
      appendImportSkip(
        summary,
        buildImportSkipEntry({
          rowNumber: row.rowNumber,
          reason,
          message,
          legacy: row.legacy,
          record: row.record,
        }),
      );
      continue;
    }

    toInsert.push(row);
  }

  return { toInsert, toUpdate };
};

const runChunkedInsert = async (
  connection,
  batchId,
  rows,
  onProgress,
  progressStart,
  progressEnd,
) => {
  if (rows.length === 0) {
    return { inserted: 0 };
  }

  const totalChunks = Math.ceil(rows.length / BATCH_SIZE);
  let inserted = 0;

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const chunk = rows.slice(index, index + BATCH_SIZE);
    const { inserted: chunkInserted, productIds } = await bulkInsertProducts(
      connection,
      batchId,
      chunk,
    );

    await bulkInsertNormalizedDetails(connection, productIds, chunk.map((row) => row.record));

    inserted += chunkInserted;

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

  return { inserted };
};

const runChunkedUpdate = async (
  connection,
  rows,
  onProgress,
  progressStart,
  progressEnd,
) => {
  if (rows.length === 0) {
    return 0;
  }

  const totalChunks = Math.ceil(rows.length / BATCH_SIZE);
  let updated = 0;

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const chunk = rows.slice(index, index + BATCH_SIZE);

    await bulkUpdateProducts(connection, chunk);
    await bulkUpsertNormalizedDetails(
      connection,
      chunk.map((row) => row.productId),
      chunk.map((row) => row.record),
    );

    updated += chunk.length;

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

  return updated;
};

const schedulePostProcessing = (
  batchId,
  previousBatchId = null,
  defer = DEFER_POST_PROCESSING,
  importMode = IMPORT_MODES.INSERT,
) => {
  if (importMode !== IMPORT_MODES.INSERT || !previousBatchId) {
    return { deferred: false, skipped: true };
  }

  const run = () =>
    refreshDailySalesSummary(batchId, pool, { previousBatchId }).catch(
      (error) => {
        importLogger.error('daily sales summary refresh failed', {
          batchId,
          previousBatchId,
          error: error.message,
        });
      },
    );

  if (defer) {
    setImmediate(run);
    logImport('post-processing scheduled in background', {
      batchId,
      previousBatchId,
    });
    return { deferred: true };
  }

  return run();
};

const normalizeImportMode = (importMode) => {
  const normalized = String(importMode ?? IMPORT_MODES.INSERT).trim().toLowerCase();

  if (!VALID_IMPORT_MODES.has(normalized)) {
    throw new ApiError(400, `importMode must be one of: insert, update, upsert`);
  }

  return normalized;
};

const importProductsFromExcel = async (
  buffer,
  uploadedBy = null,
  {
    branchId = null,
    importMode = IMPORT_MODES.INSERT,
    mappings = null,
    onProgress,
    deferPostProcessing = DEFER_POST_PROCESSING,
  } = {},
) => {
  const mode = normalizeImportMode(importMode);

  const reportProgress = (patch) => {
    if (onProgress) {
      onProgress(patch);
    }
  };

  reportProgress({ phase: 'parsing', progress: 5, message: 'Parsing Excel file' });

  const parseStartedAt = Date.now();
  logImport('excel parse started', {
    bufferBytes: Buffer.isBuffer(buffer) ? buffer.length : null,
    importMode: mode,
  });

  let parsed;

  try {
    parsed = await parseStockExcel(buffer, { mappings });
  } catch (error) {
    logImport('excel parse failed', {
      durationMs: Date.now() - parseStartedAt,
      error: error.message,
      stack: error.stack,
    });
    throw new ApiError(400, error.message);
  }

  const { validRows, summary: validationSummary } = processParsedRows(
    parsed.rows,
    await erpProductCodeService.buildLookupMap(),
  );
  const totalRowsInFile = parsed.totalRowsInFile;
  const skippedAfterValidation = validationSummary.skipped;

  if (skippedAfterValidation > 0) {
    logSkippedRows('validation', {
      skipped: skippedAfterValidation,
      skippedRows: validationSummary.skippedRows,
    });
  }

  logImport('excel parse completed', {
    durationMs: Date.now() - parseStartedAt,
    totalRowsInFile,
    candidateRows: parsed.rows.length,
    validRows: validRows.length,
    mappedFieldCount: parsed.mappedFieldCount,
    skipped: validationSummary.skipped,
    skippedRows: validationSummary.skippedRows,
    failed: validationSummary.failedRecords,
    duplicates: validationSummary.duplicateRecords,
  });

  if (validRows.length === 0) {
    return {
      importMode: mode,
      totalRecords: validationSummary.totalRecords,
      totalRowsInFile,
      skipped: validationSummary.skipped,
      skippedRows: validationSummary.skippedRows,
      importedRecords: 0,
      updatedRecords: 0,
      duplicateRecords: validationSummary.duplicateRecords,
      failedRecords: validationSummary.failedRecords,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      batchId: null,
      isNewBatch: false,
      previousBatchId: null,
      taggedRows: validationSummary.taggedRows,
      untaggedRows: validationSummary.untaggedRows,
      errors: validationSummary.errors,
      mappedFieldCount: parsed.mappedFieldCount,
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

    const resolvedBranchId = await resolveOperationalBranchId({ branchId });

    const { batchId, isNewBatch, previousBatchId } = await resolveImportBatch(
      connection,
      resolvedBranchId,
      uploadedBy,
      mode,
    );

    const { toInsert, toUpdate } = await classifyRowsForMode(
      connection,
      batchId,
      validRows,
      mode,
      validationSummary,
    );

    const classificationSkips = validationSummary.skipped - skippedAfterValidation;
    if (classificationSkips > 0) {
      logSkippedRows('update classification', {
        skipped: classificationSkips,
        skippedRows: validationSummary.skippedRows.slice(skippedAfterValidation),
      });
    }

    reportProgress({
      phase: 'inserting',
      progress: 15,
      message: mode === IMPORT_MODES.UPDATE ? 'Updating products' : 'Importing products',
      total: validRows.length,
      processed: 0,
    });

    const insertStartedAt = Date.now();
    logImport('persist started', {
      batchId,
      previousBatchId,
      importMode: mode,
      toInsert: toInsert.length,
      toUpdate: toUpdate.length,
      batchSize: BATCH_SIZE,
    });

    const { inserted } = await runChunkedInsert(
      connection,
      batchId,
      toInsert,
      ({ processed, total, percent }) =>
        reportProgress({
          phase: 'inserting',
          message: 'Importing products',
          progress: 15 + Math.round((percent / 100) * 40),
          processed,
          total,
        }),
      0,
      100,
    );

    const updated = await runChunkedUpdate(
      connection,
      toUpdate,
      ({ processed, total, percent }) =>
        reportProgress({
          phase: 'updating',
          message: 'Updating products',
          progress: 55 + Math.round((percent / 100) * 40),
          processed,
          total,
        }),
      0,
      100,
    );

    await disableBulkSession(connection);
    await connection.commit();

    validationSummary.importedRecords = inserted;
    validationSummary.updatedRecords = updated;

    logImport('persist completed', {
      batchId,
      previousBatchId,
      importMode: mode,
      inserted,
      updated,
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
      importMode: mode,
      totalRowsInFile,
      ...validationSummary,
    });

    const postProcessing = schedulePostProcessing(
      batchId,
      previousBatchId,
      deferPostProcessing,
      mode,
    );

    return {
      importMode: mode,
      batchId,
      previousBatchId,
      isNewBatch,
      totalRecords: validationSummary.totalRecords,
      totalRowsInFile,
      skipped: validationSummary.skipped,
      skippedRows: validationSummary.skippedRows,
      importedRecords: inserted,
      updatedRecords: updated,
      duplicateRecords: validationSummary.duplicateRecords,
      failedRecords: validationSummary.failedRecords,
      inserted,
      updated,
      unchanged: 0,
      validRows: validRows.length,
      taggedRows: validationSummary.taggedRows,
      untaggedRows: validationSummary.untaggedRows,
      errors: validationSummary.errors,
      mappedFieldCount: parsed.mappedFieldCount,
      postProcessingDeferred: Boolean(postProcessing?.deferred),
    };
  } catch (error) {
    await disableBulkSession(connection).catch(() => {});
    await connection.rollback();
    importLogger.error('Product import failed', { error: error.message, stack: error.stack });
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
    importMode: meta.importMode ?? IMPORT_MODES.INSERT,
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
        branchId: meta.branchId ?? null,
        importMode: meta.importMode ?? IMPORT_MODES.INSERT,
        mappings: meta.mappings ?? null,
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
        processed: result.validRows ?? result.importedRecords + result.updatedRecords,
        total: result.validRows ?? result.importedRecords + result.updatedRecords,
        result,
      });
    } catch (error) {
      const failureMessage = error?.message || 'Import failed';

      importLogger.error('async import failed', {
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
