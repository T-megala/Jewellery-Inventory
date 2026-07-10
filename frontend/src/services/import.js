import {
  apiUrl,
  authFetch,
  buildQueryString,
  getAuthHeaders,
  uploadFormDataWithProgress,
} from './api.js';
import { createUserError } from '../utils/userErrorMessage.js';

/** Bulk stock import — POST multipart/form-data with field name "file" */
export const BULK_STOCK_IMPORT_URL = apiUrl('/products/import');

const POLL_INTERVAL_MS = 800;
const MAX_POLL_ATTEMPTS = 60 * 60; // ~48 min at 800ms
const UPLOAD_PROGRESS_WEIGHT = 12;

function normalizeImportResult(data) {
  if (!data) {
    return null;
  }

  const inserted = Number(
    data.inserted ?? data.importedRecords ?? data.imported ?? 0,
  );
  const updated = Number(data.updated ?? data.updatedRecords ?? 0);
  const unchanged = Number(data.unchanged ?? 0);
  const skipped = Number(data.skipped ?? 0);
  const failed = Number(data.failedRecords ?? 0);
  const totalRowsInFile = Number(data.totalRowsInFile ?? data.totalRecords ?? 0);

  return {
    batchId: data.batchId ?? null,
    isNewBatch: Boolean(data.isNewBatch),
    fastPath: Boolean(data.fastPath),
    totalRowsInFile,
    skipped,
    failed,
    inserted,
    updated,
    unchanged,
    processed: inserted + updated + unchanged,
  };
}

function combineProgress(phase, uploadPercent = 0, serverProgress = 0) {
  if (phase === 'uploading') {
    if (uploadPercent > 0) {
      return Math.max(1, Math.round((uploadPercent / 100) * UPLOAD_PROGRESS_WEIGHT));
    }
    return 2;
  }

  const server = Number(serverProgress ?? 0);
  return UPLOAD_PROGRESS_WEIGHT + Math.round((server / 100) * (100 - UPLOAD_PROGRESS_WEIGHT));
}

function buildProgressMessage(phase, { uploadPercent = 0, status = null } = {}) {
  switch (phase) {
    case 'uploading':
      if (uploadPercent > 0) {
        return `Uploading file… ${uploadPercent}%`;
      }
      return 'Uploading file…';
    case 'queued':
    case 'starting':
      return 'File received — starting import…';
    case 'parsing':
      return 'Parsing Excel rows…';
    case 'preparing':
      return 'Preparing import batch…';
    case 'inserting':
    case 'updating':
      return status?.message || 'Saving products to database…';
    case 'completed':
      return 'Import completed';
    default:
      return status?.message || 'Processing import…';
  }
}

async function parseJsonResponse(res) {
  let json;
  try {
    json = await res.json();
  } catch {
    throw createUserError(null, 'Unable to upload file. Please try again.');
  }

  if (!json.success && json.status !== true && res.status !== 202) {
    throw createUserError(json.message || json.error, 'Unable to upload file. Please try again.');
  }

  return json;
}

async function startAsyncImport(file, { branchId, onUploadProgress } = {}) {
  const formData = new FormData();
  formData.append('file', file);

  if (branchId) {
    formData.append('branchId', String(branchId));
  }

  const query = buildQueryString({ async: true, branchId });
  const url = apiUrl(`/products/import?${query}`);

  let res;

  try {
    res = await uploadFormDataWithProgress(url, formData, {
      headers: {
        ...getAuthHeaders({ branchId }),
      },
      onProgress: onUploadProgress,
    });
  } catch (err) {
    throw createUserError(err?.message, 'Unable to upload file. Please try again.');
  }

  const json = await parseJsonResponse(res);

  if (!res.ok || res.status !== 202) {
    if (import.meta.env.DEV) {
      console.error('[import] upload failed', json);
    }
    throw createUserError(json.message || json.error, 'Unable to start import. Please try again.');
  }

  if (import.meta.env.DEV) {
    console.info('[import] upload accepted', json.data);
  }
  return json.data;
}

export async function getImportStatus(jobId, { branchId } = {}) {
  let res;

  try {
    res = await authFetch(apiUrl(`/products/import/status/${jobId}`), {
      headers: {
        ...getAuthHeaders({ branchId }),
      },
    });
  } catch (err) {
    throw createUserError(err?.message, 'Unable to check import status. Please try again.');
  }

  const json = await parseJsonResponse(res);

  if (!res.ok) {
    throw createUserError(json.message || json.error, 'Unable to check import status. Please try again.');
  }

  return json.data;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function uploadStockExcel(file, { branchId, onProgress } = {}) {
  const report = (patch) => {
    if (onProgress) {
      onProgress(patch);
    }
  };

  report({
    status: 'processing',
    phase: 'uploading',
    progress: 2,
    message: 'Uploading file…',
    processed: 0,
    total: 0,
    uploadPercent: 0,
    uploadLoaded: 0,
    uploadTotal: file?.size ?? 0,
  });

  const { jobId } = await startAsyncImport(file, {
    branchId,
    onUploadProgress: ({ loaded, total, percent }) => {
      report({
        status: 'processing',
        phase: 'uploading',
        progress: combineProgress('uploading', percent, 0),
        message: buildProgressMessage('uploading', { uploadPercent: percent }),
        processed: 0,
        total: 0,
        uploadPercent: percent,
        uploadLoaded: loaded,
        uploadTotal: total || file?.size || 0,
      });
    },
  });

  report({
    status: 'processing',
    phase: 'starting',
    progress: combineProgress('starting', 100, 0),
    message: buildProgressMessage('starting'),
    processed: 0,
    total: 0,
  });

  let attempts = 0;

  while (attempts < MAX_POLL_ATTEMPTS) {
    attempts += 1;
    await wait(POLL_INTERVAL_MS);

    const status = await getImportStatus(jobId, { branchId });
    const phase = status.phase || status.status || 'processing';

    const normalizedStatus = {
      ...status,
      phase,
      progress: combineProgress(phase, 100, status.progress ?? 0),
      message: buildProgressMessage(phase, { status }),
    };

    if (import.meta.env.DEV) {
      console.info('[import] status', {
        jobId,
        status: normalizedStatus.status,
        phase: normalizedStatus.phase,
        progress: normalizedStatus.progress,
        message: normalizedStatus.message,
        processed: normalizedStatus.processed,
        total: normalizedStatus.total,
      });
    }

    report(normalizedStatus);

    if (status.status === 'completed') {
      if (import.meta.env.DEV) {
        console.info('[import] completed', status.result);
      }
      return normalizeImportResult(status.result);
    }

    if (status.status === 'failed') {
      if (import.meta.env.DEV) {
        console.error('[import] failed', status);
      }
      throw createUserError(status.error || status.message, 'Import failed. Please try again.');
    }
  }

  throw createUserError(
    'Import is taking longer than expected. Check stock list or try again.',
    'Import timed out while waiting for completion.',
  );
}
