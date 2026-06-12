const normalizeName = (value) => String(value ?? "").trim();

/** Normalize scanned barcode for comparison and storage */
export const normalizeTag = (value) => normalizeName(value).toUpperCase();

export const TAG_EXPR = "UPPER(TRIM(barcode))";

export const buildActiveBatchInventoryFilter = (batchId) => ({
  whereClause: "batch_id = ? AND barcode IS NOT NULL AND TRIM(barcode) != ''",
  params: [batchId],
});
