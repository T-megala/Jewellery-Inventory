import { API_BASE, apiUpload } from './api.js';

/** Bulk stock import — POST multipart/form-data with field name "file" */
export const BULK_STOCK_IMPORT_URL = `${API_BASE}/products/import`;

function normalizeImportResult(data) {
  const inserted = Number(data?.inserted ?? data?.imported ?? 0);
  const updated = Number(data?.updated ?? 0);
  const unchanged = Number(data?.unchanged ?? 0);
  const skipped = Number(data?.skipped ?? 0);
  const totalRowsInFile = Number(data?.totalRowsInFile ?? 0);

  return {
    batchId: data?.batchId ?? null,
    isNewBatch: Boolean(data?.isNewBatch),
    totalRowsInFile,
    skipped,
    inserted,
    updated,
    unchanged,
    processed: inserted + updated + unchanged,
  };
}

export async function uploadStockExcel(file) {
  const formData = new FormData();
  formData.append('file', file);
  const data = await apiUpload('/products/import', formData);
  return normalizeImportResult(data);
}
