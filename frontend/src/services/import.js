import { apiUrl, authFetch, buildQueryString, getAuthHeaders } from './api.js';
import { createUserError } from '../utils/userErrorMessage.js';

/** Bulk stock import — POST multipart/form-data with field name "file" */
export const BULK_STOCK_IMPORT_URL = apiUrl('/products/import');

const POLL_INTERVAL_MS = 800;

function normalizeImportResult(data) {
  if (!data) {
    return null;
  }

  const inserted = Number(data.inserted ?? data.imported ?? 0);
  const updated = Number(data.updated ?? 0);
  const unchanged = Number(data.unchanged ?? 0);
  const skipped = Number(data.skipped ?? 0);
  const totalRowsInFile = Number(data.totalRowsInFile ?? 0);

  return {
    batchId: data.batchId ?? null,
    isNewBatch: Boolean(data.isNewBatch),
    fastPath: Boolean(data.fastPath),
    totalRowsInFile,
    skipped,
    inserted,
    updated,
    unchanged,
    processed: inserted + updated + unchanged,
  };
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

export async function startAsyncImport(file, { branchId } = {}) {
  const formData = new FormData();
  formData.append('file', file);

  if (branchId) {
    formData.append('branchId', String(branchId));
  }

  const query = buildQueryString({ async: true, branchId });

  console.info('[import] starting upload', {
    fileName: file?.name,
    fileSize: file?.size,
    fileType: file?.type,
    branchId,
  });

  const res = await authFetch(apiUrl(`/products/import?${query}`), {
    method: 'POST',
    headers: {
      ...getAuthHeaders({ branchId }),
    },
    body: formData,
  });

  const json = await parseJsonResponse(res);

  if (!res.ok || res.status !== 202) {
    console.error('[import] upload failed', json);
    throw createUserError(json.message || json.error, 'Unable to start import. Please try again.');
  }

  console.info('[import] upload accepted', json.data);
  return json.data;
}

export async function getImportStatus(jobId) {
  const res = await authFetch(apiUrl(`/products/import/status/${jobId}`), {
    headers: {
      ...getAuthHeaders(),
    },
  });
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
  const { jobId } = await startAsyncImport(file, { branchId });

  if (onProgress) {
    onProgress({
      status: 'processing',
      phase: 'queued',
      progress: 0,
      message: 'Import queued',
      processed: 0,
      total: 0,
    });
  }

  while (true) {
    await wait(POLL_INTERVAL_MS);

    const status = await getImportStatus(jobId);

    console.info('[import] status', {
      jobId,
      status: status.status,
      phase: status.phase,
      progress: status.progress,
      message: status.message,
      processed: status.processed,
      total: status.total,
    });

    if (onProgress) {
      onProgress(status);
    }

    if (status.status === 'completed') {
      console.info('[import] completed', status.result);
      return normalizeImportResult(status.result);
    }

    if (status.status === 'failed') {
      console.error('[import] failed', status);
      throw createUserError(status.error || status.message, 'Import failed. Please try again.');
    }
  }
}
