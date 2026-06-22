const normalizeName = (value) => String(value ?? "").trim();

/** Normalize scanned barcode for comparison and storage */
export const normalizeTag = (value) => normalizeName(value).toUpperCase();

export const TAG_EXPR = "UPPER(TRIM(barcode))";

export const TAG_COLLATION = "utf8mb4_general_ci";

export const tagNoEqualsBarcodeExpr = (tagColumn, barcodeColumn) =>
  `${tagColumn} COLLATE ${TAG_COLLATION} = ${barcodeColumn} COLLATE ${TAG_COLLATION}`;

/** UTC calendar day (YYYY-MM-DD) from client epoch seconds */
export const verificationDayFromEpochSeconds = (epochSeconds) =>
  new Date(Number(epochSeconds) * 1000).toISOString().slice(0, 10);

/** SQL fragments: connection timezone is UTC (+00:00) in database.js */
export const VERIFICATION_DATE_FROM_EPOCH_SQL = "FROM_UNIXTIME(?)";
export const VERIFICATION_DAY_FROM_EPOCH_SQL = "DATE(FROM_UNIXTIME(?))";

export const buildVerificationDayFilterClause = (filters, alias = "sv") => {
  const conditions = ["1 = 1"];
  const params = [];

  if (filters.fromDate && filters.toDate) {
    if (filters.fromDate === filters.toDate) {
      conditions.push(`AND ${alias}.verification_day = ?`);
      params.push(filters.fromDate);
    } else {
      conditions.push(`AND ${alias}.verification_day BETWEEN ? AND ?`);
      params.push(filters.fromDate, filters.toDate);
    }
  } else {
    conditions.push(
      `AND ${alias}.id = (
        SELECT latest.id
        FROM stock_verification latest
        ORDER BY latest.verification_date DESC, latest.id DESC
        LIMIT 1
      )`,
    );
  }

  return { whereClause: conditions.join(" "), params };
};

export const buildActiveBatchInventoryFilter = (batchId) => ({
  whereClause: "batch_id = ? AND barcode IS NOT NULL AND TRIM(barcode) != ''",
  params: [batchId],
});
