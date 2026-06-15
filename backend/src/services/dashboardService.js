import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";
import { getActiveBatchId } from "./productBatchService.js";
import dailySalesSummaryService from "./dailySalesSummaryService.js";
import { batchProductsFrom } from "../utils/productQueryHelper.js";

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

const ALL_PRODUCTS = "All Products";
const ALL_SUB_PRODUCTS = "All Sub Products";
const ALL_CENTERS = "All Centers";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatTime12h = (date) => {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes} ${period}`;
};

const formatRelativeStocktakeTime = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThatDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfThatDay.getTime()) / 86_400_000,
  );
  const timeLabel = formatTime12h(date);

  if (dayDiff === 0) {
    return `Today ${timeLabel}`;
  }

  if (dayDiff === 1) {
    return `Yesterday ${timeLabel}`;
  }

  if (dayDiff > 1 && dayDiff < 7) {
    return `${DAY_LABELS[date.getDay()]} ${timeLabel}`;
  }

  return formatDateTime(date);
};

const emptyStocktakeSummary = () => ({
  itemsScanned: 0,
  scanRatePercent: 0,
  discrepancies: 0,
  stocktakesThisMonth: 0,
  lastStocktakeAt: null,
  lastStocktakeLabel: null,
  totalExpected: 0,
  foundCount: 0,
  missingCount: 0,
  newCount: 0,
  verificationDay: null,
});

const getLatestStocktakeRow = async () => {
  const [rows] = await pool.execute(
    `SELECT
       id,
       verification_date,
       verification_day,
       total_expected,
       total_scanned,
       found_count,
       missing_count,
       new_count,
       product_name,
       sub_product_name,
       center_name
     FROM stock_verification
     WHERE verification_day = (
       SELECT MAX(verification_day) FROM stock_verification
     )
     ORDER BY
       CASE
         WHEN product_name = ?
          AND sub_product_name = ?
          AND center_name = ?
         THEN 0
         ELSE 1
       END,
       verification_date DESC,
       id DESC
     LIMIT 1`,
    [ALL_PRODUCTS, ALL_SUB_PRODUCTS, ALL_CENTERS],
  );

  return rows[0] ?? null;
};

const getStocktakeSummary = async () => {
  const [monthResult, latestRow] = await Promise.all([
    pool.execute(
      `SELECT COUNT(DISTINCT verification_day) AS stocktakesThisMonth
       FROM stock_verification
       WHERE YEAR(verification_day) = YEAR(CURDATE())
         AND MONTH(verification_day) = MONTH(CURDATE())`,
    ),
    getLatestStocktakeRow(),
  ]);

  const stocktakesThisMonth = Number(monthResult[0][0]?.stocktakesThisMonth ?? 0);

  if (!latestRow) {
    return {
      ...emptyStocktakeSummary(),
      stocktakesThisMonth,
    };
  }

  const totalExpected = Number(latestRow.total_expected ?? 0);
  const itemsScanned = Number(latestRow.total_scanned ?? 0);
  const foundCount = Number(latestRow.found_count ?? 0);
  const missingCount = Number(latestRow.missing_count ?? 0);
  const newCount = Number(latestRow.new_count ?? 0);
  const discrepancies = missingCount + newCount;
  const scanRatePercent =
    totalExpected > 0
      ? Number(((foundCount / totalExpected) * 100).toFixed(2))
      : 0;
  const lastStocktakeAt = formatDateTime(latestRow.verification_date);

  return {
    itemsScanned,
    scanRatePercent,
    discrepancies,
    stocktakesThisMonth,
    lastStocktakeAt,
    lastStocktakeLabel: formatRelativeStocktakeTime(latestRow.verification_date),
    totalExpected,
    foundCount,
    missingCount,
    newCount,
    verificationDay: formatDate(latestRow.verification_day),
    scope: {
      product: latestRow.product_name,
      subProduct: latestRow.sub_product_name,
      center: latestRow.center_name,
    },
  };
};

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
  const counterNameExpr = `CASE
    WHEN counter_name IS NULL OR TRIM(counter_name) = '' THEN 'Unassigned'
    ELSE TRIM(counter_name)
  END`;

  const [[totalsRows], [byProductRows], [byCounterRows], [recentRows]] =
    await Promise.all([
      pool.execute(
        `SELECT
           COUNT(*) AS totalTags,
           COALESCE(SUM(pieces), 0) AS totalPieces,
           COALESCE(SUM(gross_wt), 0) AS totalGrossWt,
           COALESCE(SUM(net_wt), 0) AS totalNetWt,
           COUNT(DISTINCT product) AS productGroups,
           COUNT(DISTINCT CONCAT(product, '|', sub_product)) AS subProducts,
           COUNT(DISTINCT ${counterNameExpr}) AS counters
         ${batchProductsFrom}`,
        [batchId],
      ),
      pool.execute(
        `SELECT
           product AS name,
           COUNT(DISTINCT sub_product) AS subProductCount,
           COUNT(*) AS tagCount,
           COALESCE(SUM(pieces), 0) AS pieceCount
         ${batchProductsFrom}
         GROUP BY product
         ORDER BY pieceCount DESC, product ASC`,
        [batchId],
      ),
      pool.execute(
        `SELECT
           ${counterNameExpr} AS name,
           COUNT(DISTINCT CONCAT(product, '|', sub_product)) AS subProductCount,
           COUNT(DISTINCT product) AS productCount,
           COUNT(*) AS tagCount
         ${batchProductsFrom}
         GROUP BY ${counterNameExpr}
         ORDER BY subProductCount DESC, name ASC`,
        [batchId],
      ),
      pool.execute(
        `SELECT
           id,
           product,
           sub_product AS subProduct,
           counter_name AS counterName,
           tag_packet_no AS tagPacketNo
         ${batchProductsFrom}
         ORDER BY id DESC
         LIMIT 10`,
        [batchId],
      ),
    ]);

  const totalsRow = totalsRows[0];

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
  const [sumResult, stocktake] = await Promise.all([
    pool.execute(
      `SELECT
         COALESCE(SUM(found_count), 0) AS foundCount,
         COALESCE(SUM(missing_count), 0) AS missingCount,
         COALESCE(SUM(new_count), 0) AS newCount,
         COALESCE(SUM(found_count + missing_count + new_count), 0) AS totalRecords
       FROM stock_verification`,
    ),
    getStocktakeSummary(),
  ]);

  const row = sumResult[0][0] ?? {};

  return {
    totalFound: Number(row.foundCount ?? 0),
    totalMissing: Number(row.missingCount ?? 0),
    totalNew: Number(row.newCount ?? 0),
    totalTags: Number(row.totalRecords ?? 0),
    stocktake,
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

const TOP_SOLD_PERIOD_LIMITS = {
  week: 7,
  month: 30,
};

const getTopSoldProducts = async ({ period = "all" } = {}) => {
  const normalizedPeriod = String(period ?? "all").trim().toLowerCase();
  const intervalDays = TOP_SOLD_PERIOD_LIMITS[normalizedPeriod];

  if (normalizedPeriod !== "all" && !intervalDays) {
    throw new ApiError(400, 'period must be "all", "week", or "month"');
  }

  const conditions = [
    "isa.product IS NOT NULL",
    "TRIM(isa.product) != ''",
  ];
  const params = [];

  if (intervalDays) {
    conditions.push("b.batch_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)");
    params.push(intervalDays);
  }

  const [rows] = await pool.execute(
    `SELECT
       isa.product AS productName,
       COALESCE(SUM(isa.sold_tags), 0) AS soldTags,
       COALESCE(SUM(isa.sold_pieces), 0) AS soldCount
     FROM inventory_sales_audit isa
     INNER JOIN product_upload_batches b ON b.id = isa.batch_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY isa.product
     HAVING soldCount > 0 OR soldTags > 0
     ORDER BY soldCount DESC, soldTags DESC, isa.product ASC
     LIMIT 10`,
    params,
  );

  const batches = await getLatestTwoBatchIds();
  const latestBatchId = batches[0]?.id ?? null;
  const previousBatchId = batches[1]?.id ?? null;

  return {
    period: normalizedPeriod,
    latestBatch: latestBatchId ? await getBatchInfo(latestBatchId) : null,
    previousBatch: previousBatchId ? await getBatchInfo(previousBatchId) : null,
    products: rows.map((row) => ({
      productName: row.productName,
      soldTags: Number(row.soldTags ?? 0),
      soldCount: Number(row.soldCount ?? 0),
    })),
  };
};

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
       SUM(sold_pieces) AS sold_pieces,
       SUM(sold_tags) AS sold_tags
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
    soldPieces: Number(row.sold_pieces ?? 0),
    soldTags: Number(row.sold_tags ?? 0),
  }));

  const totalSoldPieces = data.reduce((sum, row) => sum + row.soldPieces, 0);

  return {
    period: validatedPeriod,
    counter:
      counterName === dailySalesSummaryService.ALL_COUNTER
        ? "all"
        : counterName,
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
            total_stock_pieces,
            sold_tags,
            sold_pieces,
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

  const counterName =
    dailySalesSummaryService.validateDailyImportCounter(counter);

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
      totalStockPieces: Number(row.total_stock_pieces ?? 0),
      soldTags: Number(row.sold_tags ?? 0),
      soldPieces: Number(row.sold_pieces ?? row.estimated_sold ?? 0),
      estimatedSold: Number(row.sold_pieces ?? row.estimated_sold ?? 0),
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
  getStocktakeSummary,
};
