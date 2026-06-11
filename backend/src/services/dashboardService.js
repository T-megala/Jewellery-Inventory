import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";
import { getActiveBatchId } from "./productBatchService.js";
import dailySalesSummaryService from "./dailySalesSummaryService.js";

const PRODUCT_TAG_FILTER = `
  tag_packet_no IS NOT NULL
  AND TRIM(tag_packet_no) != ''
  AND product IS NOT NULL
  AND TRIM(product) != ''
`;

const formatDateTime = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
};

const emptyTotals = () => ({
  totalTags: 0,
  totalPieces: 0,
  totalGrossWt: 0,
  totalNetWt: 0,
  productGroups: 0,
  subProducts: 0,
  counters: 0,
});

const getBatchInfo = async (batchId) => {
  const [rows] = await pool.execute(
    `SELECT id, batch_date, uploaded_at, uploaded_by, is_active
     FROM product_upload_batches
     WHERE id = ?`,
    [batchId],
  );

  if (!rows.length) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    batchDate: formatDate(row.batch_date),
    uploadedAt: formatDateTime(row.uploaded_at),
    uploadedBy: row.uploaded_by,
    isActive: Boolean(row.is_active),
  };
};

const getInventorySummary = async () => {
  const batchId = await getActiveBatchId();

  if (!batchId) {
    return {
      batch: null,
      totals: emptyTotals(),
      byProduct: [],
      byCounter: [],
      recentTags: [],
    };
  }

  const batch = await getBatchInfo(batchId);
  const baseWhere = `batch_id = ?
    AND tag_packet_no IS NOT NULL
    AND TRIM(tag_packet_no) != ''`;
  const counterNameExpr = `CASE
    WHEN counter_name IS NULL OR TRIM(counter_name) = '' THEN 'Unassigned'
    ELSE TRIM(counter_name)
  END`;

  const [[totalsRow]] = await pool.execute(
    `SELECT
       COUNT(*) AS totalTags,
       COALESCE(SUM(pieces), 0) AS totalPieces,
       COALESCE(SUM(gross_wt), 0) AS totalGrossWt,
       COALESCE(SUM(net_wt), 0) AS totalNetWt,
       COUNT(DISTINCT product) AS productGroups,
       COUNT(DISTINCT CONCAT(product, '|', sub_product)) AS subProducts,
       COUNT(DISTINCT ${counterNameExpr}) AS counters
     FROM products
     WHERE ${baseWhere}`,
    [batchId],
  );

  const [byProductRows] = await pool.execute(
    `SELECT
       product AS name,
       COUNT(DISTINCT sub_product) AS subProductCount,
       COUNT(*) AS tagCount,
       COALESCE(SUM(pieces), 0) AS pieceCount
     FROM products
     WHERE ${baseWhere}
     GROUP BY product
     ORDER BY pieceCount DESC, product ASC`,
    [batchId],
  );

  const [byCounterRows] = await pool.execute(
    `SELECT
       ${counterNameExpr} AS name,
       COUNT(DISTINCT CONCAT(product, '|', sub_product)) AS subProductCount,
       COUNT(DISTINCT product) AS productCount,
       COUNT(*) AS tagCount
     FROM products
     WHERE ${baseWhere}
     GROUP BY ${counterNameExpr}
     ORDER BY subProductCount DESC, name ASC`,
    [batchId],
  );

  const [recentRows] = await pool.execute(
    `SELECT
       id,
       product,
       sub_product AS subProduct,
       counter_name AS counterName,
       tag_packet_no AS tagPacketNo
     FROM products
     WHERE batch_id = ?
     ORDER BY id DESC
     LIMIT 10`,
    [batchId],
  );

  return {
    batch,
    totals: {
      totalTags: Number(totalsRow.totalTags ?? 0),
      totalPieces: Number(totalsRow.totalPieces ?? 0),
      totalGrossWt: Number(totalsRow.totalGrossWt ?? 0),
      totalNetWt: Number(totalsRow.totalNetWt ?? 0),
      productGroups: Number(totalsRow.productGroups ?? 0),
      subProducts: Number(totalsRow.subProducts ?? 0),
      counters: Number(totalsRow.counters ?? 0),
    },
    byProduct: byProductRows.map((row) => ({
      name: row.name,
      subProductCount: Number(row.subProductCount ?? 0),
      tagCount: Number(row.tagCount ?? 0),
      pieceCount: Number(row.pieceCount ?? 0),
    })),
    byCounter: byCounterRows.map((row) => ({
      name: row.name,
      subProductCount: Number(row.subProductCount ?? 0),
      productCount: Number(row.productCount ?? 0),
      tagCount: Number(row.tagCount ?? 0),
    })),
    recentTags: recentRows.map((row) => ({
      id: row.id,
      product: row.product,
      subProduct: row.subProduct,
      counterName: row.counterName,
      tagPacketNo: row.tagPacketNo,
    })),
  };
};

const getVerificationSummary = async () => {
  const [rows] = await pool.execute(
    `SELECT
       COALESCE(SUM(found_count), 0) AS foundCount,
       COALESCE(SUM(missing_count), 0) AS missingCount,
       COALESCE(SUM(new_count), 0) AS newCount,
       COALESCE(SUM(found_count + missing_count + new_count), 0) AS totalRecords
     FROM stock_verification`,
  );

  const row = rows[0] ?? {};

  return {
    totalFound: Number(row.foundCount ?? 0),
    totalMissing: Number(row.missingCount ?? 0),
    totalNew: Number(row.newCount ?? 0),
    totalTags: Number(row.totalRecords ?? 0),
  };
};

const getDashboard = async () => {
  const [inventory, verification] = await Promise.all([
    getInventorySummary(),
    getVerificationSummary(),
  ]);

  return {
    inventory,
    verification,
  };
};

const getLatestTwoBatchIds = async () => {
  const [rows] = await pool.execute(
    `SELECT id, batch_date, uploaded_at
     FROM product_upload_batches
     ORDER BY id DESC
     LIMIT 2`,
  );

  return rows;
};

const getTopSoldProducts = async () => {
  const batches = await getLatestTwoBatchIds();

  if (batches.length < 2) {
    throw new ApiError(
      400,
      "At least two imported batches are required to generate sales comparison.",
    );
  }

  const [latestBatch, previousBatch] = batches;
  const latestBatchId = latestBatch.id;
  const previousBatchId = previousBatch.id;

  const [rows] = await pool.execute(
    `SELECT
       productName,
       yesterdayCount,
       todayCount,
       soldCount
     FROM (
       SELECT
         old_data.product AS productName,
         old_data.total_count AS yesterdayCount,
         COALESCE(new_data.total_count, 0) AS todayCount,
         CASE
           WHEN old_data.total_count > COALESCE(new_data.total_count, 0)
           THEN old_data.total_count - COALESCE(new_data.total_count, 0)
           ELSE 0
         END AS soldCount
       FROM (
         SELECT product, COUNT(*) AS total_count
         FROM products
         WHERE batch_id = ?
           AND ${PRODUCT_TAG_FILTER}
         GROUP BY product
       ) old_data
       LEFT JOIN (
         SELECT product, COUNT(*) AS total_count
         FROM products
         WHERE batch_id = ?
           AND ${PRODUCT_TAG_FILTER}
         GROUP BY product
       ) new_data ON old_data.product = new_data.product
     ) sales
     WHERE soldCount > 0
     ORDER BY soldCount DESC, productName ASC
     LIMIT 10`,
    [previousBatchId, latestBatchId],
  );

  return {
    latestBatch: await getBatchInfo(latestBatchId),
    previousBatch: await getBatchInfo(previousBatchId),
    products: rows.map((row) => ({
      productName: row.productName,
      yesterdayCount: Number(row.yesterdayCount ?? 0),
      todayCount: Number(row.todayCount ?? 0),
      soldCount: Number(row.soldCount ?? 0),
    })),
  };
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const toDateKey = (value) => {
  if (value instanceof Date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  return String(value).slice(0, 10);
};

const formatDayLabel = (batchDate) => {
  const dateKey = toDateKey(batchDate);
  const todayKey = toDateKey(new Date());

  if (dateKey === todayKey) {
    return "Today";
  }

  const date = new Date(`${dateKey}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }

  return DAY_LABELS[date.getDay()];
};

const getDayWiseSales = async ({ period = "week", counter = "all" } = {}) => {
  const validatedPeriod = dailySalesSummaryService.validatePeriod(period);

  if (!validatedPeriod) {
    throw new ApiError(400, 'period must be "week" or "month"');
  }

  const counterName = dailySalesSummaryService.resolveCounterFilter(counter);
  const intervalDays = validatedPeriod === "month" ? 30 : 7;

  const [rows] = await pool.execute(
    `SELECT
       batch_date,
       SUM(estimated_sold) AS estimated_sold
     FROM daily_sales_summary
     WHERE counter_name = ?
       AND batch_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY batch_date
     ORDER BY batch_date ASC`,
    [counterName, intervalDays],
  );

  const data = rows.map((row) => ({
    date: toDateKey(row.batch_date),
    day: formatDayLabel(row.batch_date),
    soldPieces: Number(row.estimated_sold ?? 0),
  }));

  const totalSoldPieces = data.reduce(
    (sum, row) => sum + row.soldPieces,
    0,
  );

  return {
    period: validatedPeriod,
    counter: counterName === dailySalesSummaryService.ALL_COUNTER ? "all" : counterName,
    totalSoldPieces,
    data,
  };
};

const DAILY_IMPORT_PERIOD_LIMITS = {
  week: 7,
  month: 30,
};

const buildDailyImportQuery = ({
  counterName,
  limit,
  fromDate,
  toDate,
  batchFrom,
  batchTo,
}) => {
  const conditions = ["counter_name = ?"];
  const params = [counterName];

  if (fromDate) {
    conditions.push("batch_date >= ?");
    params.push(fromDate);
  }

  if (toDate) {
    conditions.push("batch_date <= ?");
    params.push(toDate);
  }

  if (batchFrom) {
    conditions.push("batch_id >= ?");
    params.push(batchFrom);
  }

  if (batchTo) {
    conditions.push("batch_id <= ?");
    params.push(batchTo);
  }

  return {
    sql: `SELECT
            batch_id,
            batch_date,
            total_stock,
            estimated_sold
          FROM daily_sales_summary
          WHERE ${conditions.join(" AND ")}
          ORDER BY batch_id DESC
          LIMIT ${limit}`,
    params,
  };
};

const getDailyImports = async ({
  period = "week",
  counter = dailySalesSummaryService.ALL_COUNTER,
  fromDate,
  toDate,
  batchFrom,
  batchTo,
} = {}) => {
  const validatedPeriod = dailySalesSummaryService.validatePeriod(period);

  if (!validatedPeriod) {
    throw new ApiError(
      400,
      "Invalid period. Allowed values are week or month.",
    );
  }

  const counterName = dailySalesSummaryService.validateDailyImportCounter(counter);

  if (!counterName) {
    throw new ApiError(
      400,
      "Invalid counter. Allowed values are ALL, SHOWROOM STOCK, SAFE STOCK, or Unassigned.",
    );
  }

  const limit = DAILY_IMPORT_PERIOD_LIMITS[validatedPeriod];
  const { sql, params } = buildDailyImportQuery({
    counterName,
    limit,
    fromDate,
    toDate,
    batchFrom,
    batchTo,
  });

  const [rows] = await pool.execute(sql, params);

  const data = rows
    .slice()
    .reverse()
    .map((row) => ({
      batchId: Number(row.batch_id),
      date: toDateKey(row.batch_date),
      day: formatDayLabel(row.batch_date),
      totalStock: Number(row.total_stock ?? 0),
      estimatedSold: Number(row.estimated_sold ?? 0),
    }));

  return {
    period: validatedPeriod,
    counter: counterName,
    data,
  };
};

export default {
  getInventorySummary,
  getVerificationSummary,
  getDashboard,
  getTopSoldProducts,
  getDayWiseSales,
  getDailyImports,
};
