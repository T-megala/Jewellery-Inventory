import pool from "../config/database.js";

const ALL_COUNTER = "ALL";

const COUNTER_EXPR = `CASE
  WHEN counter_name IS NULL OR TRIM(counter_name) = '' THEN 'Unassigned'
  ELSE TRIM(counter_name)
END`;

const PRODUCT_TAG_FILTER = `
  tag_packet_no IS NOT NULL
  AND TRIM(tag_packet_no) != ''
`;

const formatLocalDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }

  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const logSummary = (message, meta = undefined) => {
  if (meta === undefined) {
    console.info(`[daily-sales-summary] ${message}`);
    return;
  }

  console.info(`[daily-sales-summary] ${message}`, meta);
};

const getBatchMeta = async (connection, batchId) => {
  const [rows] = await connection.execute(
    `SELECT id, batch_date
     FROM product_upload_batches
     WHERE id = ?`,
    [batchId],
  );

  return rows[0] ?? null;
};

const getPreviousBatchId = async (connection, batchId) => {
  const [rows] = await connection.execute(
    `SELECT id
     FROM product_upload_batches
     WHERE id < ?
     ORDER BY id DESC
     LIMIT 1`,
    [batchId],
  );

  return rows[0]?.id ?? null;
};

const countAllStock = async (connection, batchId) => {
  const [[row]] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM products
     WHERE batch_id = ?
       AND ${PRODUCT_TAG_FILTER}`,
    [batchId],
  );

  return Number(row.total ?? 0);
};

const countCounterStock = async (connection, batchId) => {
  const [rows] = await connection.execute(
    `SELECT
       ${COUNTER_EXPR} AS counter_name,
       COUNT(*) AS total
     FROM products
     WHERE batch_id = ?
       AND ${PRODUCT_TAG_FILTER}
     GROUP BY ${COUNTER_EXPR}`,
    [batchId],
  );

  return rows.map((row) => ({
    counterName: row.counter_name,
    total: Number(row.total ?? 0),
  }));
};

const computeEstimatedSold = (previousTotal, currentTotal) =>
  previousTotal > currentTotal ? previousTotal - currentTotal : 0;

const deleteBatchSummaries = async (connection, batchId) => {
  await connection.execute(
    `DELETE FROM daily_sales_summary WHERE batch_id = ?`,
    [batchId],
  );
};

const insertSummaryRow = async (
  connection,
  { batchId, batchDate, counterName, totalStock, estimatedSold },
) => {
  await connection.execute(
    `INSERT INTO daily_sales_summary
      (batch_id, batch_date, counter_name, total_stock, estimated_sold)
     VALUES (?, ?, ?, ?, ?)`,
    [batchId, batchDate, counterName, totalStock, estimatedSold],
  );
};

export const refreshDailySalesSummary = async (batchId, connection = pool) => {
  const batch = await getBatchMeta(connection, batchId);

  if (!batch) {
    throw new Error(`Batch ${batchId} not found`);
  }

  const previousBatchId = await getPreviousBatchId(connection, batchId);
  const batchDate = formatLocalDateKey(batch.batch_date);

  const currentAllTotal = await countAllStock(connection, batchId);
  const previousAllTotal = previousBatchId
    ? await countAllStock(connection, previousBatchId)
    : 0;

  const currentCounters = await countCounterStock(connection, batchId);
  const previousCounterMap = new Map();

  if (previousBatchId) {
    const previousCounters = await countCounterStock(connection, previousBatchId);

    for (const row of previousCounters) {
      previousCounterMap.set(row.counterName, row.total);
    }
  }

  await deleteBatchSummaries(connection, batchId);

  await insertSummaryRow(connection, {
    batchId,
    batchDate,
    counterName: ALL_COUNTER,
    totalStock: currentAllTotal,
    estimatedSold: computeEstimatedSold(previousAllTotal, currentAllTotal),
  });

  for (const counter of currentCounters) {
    const previousTotal = previousCounterMap.get(counter.counterName) ?? 0;

    await insertSummaryRow(connection, {
      batchId,
      batchDate,
      counterName: counter.counterName,
      totalStock: counter.total,
      estimatedSold: computeEstimatedSold(previousTotal, counter.total),
    });

    previousCounterMap.delete(counter.counterName);
  }

  for (const [counterName, previousTotal] of previousCounterMap.entries()) {
    await insertSummaryRow(connection, {
      batchId,
      batchDate,
      counterName,
      totalStock: 0,
      estimatedSold: computeEstimatedSold(previousTotal, 0),
    });
  }

  logSummary("summary refreshed", {
    batchId,
    batchDate,
    previousBatchId,
    allStock: currentAllTotal,
    estimatedSoldAll: computeEstimatedSold(previousAllTotal, currentAllTotal),
  });
};

export const backfillAllDailySalesSummaries = async () => {
  const [batches] = await pool.execute(
    `SELECT id FROM product_upload_batches ORDER BY id ASC`,
  );

  for (const batch of batches) {
    await refreshDailySalesSummary(batch.id);
  }

  logSummary("backfill completed", { batchCount: batches.length });
};

export const resolveCounterFilter = (counterParam) => {
  const normalized = String(counterParam ?? "all")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return ALL_COUNTER;
  }

  if (normalized === "all") {
    return ALL_COUNTER;
  }

  const aliases = {
    showroom: "SHOWROOM STOCK",
    safe: "SAFE",
    vault: "VAULT",
  };

  if (aliases[normalized]) {
    return aliases[normalized];
  }

  return String(counterParam).trim();
};

export const validatePeriod = (periodParam) => {
  const period = String(periodParam ?? "week").trim().toLowerCase();

  if (period !== "week" && period !== "month") {
    return null;
  }

  return period;
};

export default {
  refreshDailySalesSummary,
  backfillAllDailySalesSummaries,
  resolveCounterFilter,
  validatePeriod,
  ALL_COUNTER,
};
