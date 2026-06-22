import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";
import { getActiveBatchId } from "./productBatchService.js";
import dailySalesSummaryService from "./dailySalesSummaryService.js";

const PRODUCT_BARCODE_FILTER = `
  barcode IS NOT NULL
  AND TRIM(barcode) != ''
  AND item_description IS NOT NULL
  AND TRIM(item_description) != ''
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
  totalBarcodes: 0,
  totalQty: 0,
  itemDescriptions: 0,
  totalTags: 0,
  totalPieces: 0,
  productGroups: 0,
  subProducts: 0,
  totalGrossWt: 0,
  totalNetWt: 0,
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
      byDescription: [],
      byProduct: [],
      byCounter: [],
      recentItems: [],
      recentTags: [],
    };
  }

  const batch = await getBatchInfo(batchId);
  const baseWhere = `batch_id = ?
    AND ${PRODUCT_BARCODE_FILTER}`;

  const [[totalsRow]] = await pool.execute(
    `SELECT
       COUNT(*) AS totalBarcodes,
       COALESCE(SUM(closing_bal_qty), 0) AS totalQty,
       COUNT(DISTINCT item_description) AS itemDescriptions
     FROM products
     WHERE ${baseWhere}`,
    [batchId],
  );

  const [byDescriptionRows] = await pool.execute(
    `SELECT
       item_description AS name,
       COUNT(*) AS barcodeCount,
       COALESCE(SUM(closing_bal_qty), 0) AS qtySum
     FROM products
     WHERE ${baseWhere}
     GROUP BY item_description
     ORDER BY qtySum DESC, item_description ASC`,
    [batchId],
  );

  const [recentRows] = await pool.execute(
    `SELECT
       id,
       barcode,
       item_description,
       closing_bal_qty
     FROM products
     WHERE batch_id = ?
     ORDER BY id DESC
     LIMIT 10`,
    [batchId],
  );

  const totalBarcodes = Number(totalsRow.totalBarcodes ?? 0);
  const totalQty = Number(totalsRow.totalQty ?? 0);
  const itemDescriptions = Number(totalsRow.itemDescriptions ?? 0);

  const byDescription = byDescriptionRows.map((row) => ({
    name: row.name,
    barcodeCount: Number(row.barcodeCount ?? 0),
    qtySum: Number(row.qtySum ?? 0),
    tagCount: Number(row.barcodeCount ?? 0),
    pieceCount: Number(row.qtySum ?? 0),
  }));

  return {
    batch,
    totals: {
      totalBarcodes,
      totalQty,
      itemDescriptions,
      totalTags: totalBarcodes,
      totalPieces: totalQty,
      productGroups: itemDescriptions,
      subProducts: itemDescriptions,
      totalGrossWt: 0,
      totalNetWt: 0,
      counters: 0,
    },
    byDescription,
    byProduct: byDescription,
    byCounter: [],
    recentItems: recentRows.map((row) => ({
      id: row.id,
      barcode: row.barcode,
      itemDescription: row.item_description,
      closingBalQty: Number(row.closing_bal_qty ?? 0),
    })),
    recentTags: recentRows.map((row) => ({
      id: row.id,
      barcode: row.barcode,
      product: row.item_description,
      tagPacketNo: row.barcode,
      counterName: null,
    })),
  };
};

const getVerificationSummary = async () => {
  const [rows] = await pool.execute(
    `SELECT
       sv.found_count AS foundCount,
       sv.missing_count AS missingCount,
       sv.new_count AS newCount,
       sv.total_expected AS totalExpectedTags,
       sv.total_products AS totalProducts,
       sv.fully_verified_products AS fullyVerifiedProducts,
       sv.partially_verified_products AS partiallyVerifiedProducts,
       sv.not_verified_products AS notVerifiedProducts,
       sv.overall_verification_percentage AS overallVerificationPercentage
     FROM stock_verification sv
     ORDER BY sv.verification_date DESC, sv.id DESC
     LIMIT 1`,
  );

  const row = rows[0];

  if (!row) {
    return {
      tagCounts: {
        foundCount: 0,
        missingCount: 0,
        newCount: 0,
      },
      productCounts: {
        totalProducts: 0,
        fullyVerifiedProducts: 0,
        partiallyVerifiedProducts: 0,
        notVerifiedProducts: 0,
      },
      totalExpectedTags: 0,
      totalFoundTags: 0,
      totalMissingTags: 0,
      totalNewTags: 0,
      overallVerificationPercentage: 0,
      totalFound: 0,
      totalMissing: 0,
      totalNew: 0,
      totalTags: 0,
    };
  }

  const tagCounts = {
    foundCount: Number(row.foundCount ?? 0),
    missingCount: Number(row.missingCount ?? 0),
    newCount: Number(row.newCount ?? 0),
  };

  const productCounts = {
    totalProducts: Number(row.totalProducts ?? 0),
    fullyVerifiedProducts: Number(row.fullyVerifiedProducts ?? 0),
    partiallyVerifiedProducts: Number(row.partiallyVerifiedProducts ?? 0),
    notVerifiedProducts: Number(row.notVerifiedProducts ?? 0),
  };

  return {
    tagCounts,
    productCounts,
    totalExpectedTags: Number(row.totalExpectedTags ?? 0),
    totalFoundTags: tagCounts.foundCount,
    totalMissingTags: tagCounts.missingCount,
    totalNewTags: tagCounts.newCount,
    overallVerificationPercentage: Number(
      row.overallVerificationPercentage ?? 0,
    ),
    totalFound: tagCounts.foundCount,
    totalMissing: tagCounts.missingCount,
    totalNew: tagCounts.newCount,
    totalTags:
      tagCounts.foundCount + tagCounts.missingCount + tagCounts.newCount,
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
    "isa.item_description IS NOT NULL",
    "TRIM(isa.item_description) != ''",
  ];
  const params = [];

  if (intervalDays) {
    conditions.push("b.batch_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)");
    params.push(intervalDays);
  }

  const [rows] = await pool.execute(
    `SELECT
       isa.item_description AS itemDescription,
       COALESCE(SUM(isa.sold_barcodes), 0) AS soldBarcodes,
       COALESCE(SUM(isa.sold_qty), 0) AS soldQty
     FROM inventory_sales_audit isa
     INNER JOIN product_upload_batches b ON b.id = isa.batch_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY isa.item_description
     HAVING soldQty > 0 OR soldBarcodes > 0
     ORDER BY soldQty DESC, soldBarcodes DESC, isa.item_description ASC
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
      itemDescription: row.itemDescription,
      productName: row.itemDescription,
      soldBarcodes: Number(row.soldBarcodes ?? 0),
      soldQty: Number(row.soldQty ?? 0),
      soldTags: Number(row.soldBarcodes ?? 0),
      soldCount: Number(row.soldQty ?? 0),
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

const getDayWiseSales = async ({ period = "week" } = {}) => {
  const validatedPeriod = dailySalesSummaryService.validatePeriod(period);

  if (!validatedPeriod) {
    throw new ApiError(400, 'period must be "week" or "month"');
  }

  const intervalDays = validatedPeriod === "month" ? 30 : 7;

  const [rows] = await pool.execute(
    `SELECT
       batch_date,
       SUM(sold_pieces) AS sold_qty,
       SUM(sold_tags) AS sold_barcodes
     FROM daily_sales_summary
     WHERE counter_name = ?
       AND batch_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY batch_date
     ORDER BY batch_date ASC`,
    [dailySalesSummaryService.ALL_COUNTER, intervalDays],
  );

  const data = rows.map((row) => ({
    date: toDateKey(row.batch_date),
    day: formatDayLabel(row.batch_date),
    soldQty: Number(row.sold_qty ?? 0),
    soldBarcodes: Number(row.sold_barcodes ?? 0),
  }));

  const totalSoldQty = data.reduce((sum, row) => sum + row.soldQty, 0);

  return {
    period: validatedPeriod,
    totalSoldQty,
    totalSoldPieces: totalSoldQty,
    counter: "all",
    data: data.map((row) => ({
      ...row,
      soldPieces: row.soldQty,
    })),
  };
};

const DAILY_IMPORT_PERIOD_LIMITS = {
  week: 7,
  month: 30,
};

const buildDailyImportQuery = ({
  limit,
  fromDate,
  toDate,
  batchFrom,
  batchTo,
}) => {
  const conditions = ["counter_name = ?"];
  const params = [dailySalesSummaryService.ALL_COUNTER];

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
            sold_pieces
          FROM daily_sales_summary
          WHERE ${conditions.join(" AND ")}
          ORDER BY batch_id DESC
          LIMIT ${limit}`,
    params,
  };
};

const getDailyImports = async ({
  period = "week",
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

  const limit = DAILY_IMPORT_PERIOD_LIMITS[validatedPeriod];
  const { sql, params } = buildDailyImportQuery({
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
      totalBarcodes: Number(row.total_stock ?? 0),
      totalQty: Number(row.total_stock_pieces ?? 0),
      soldBarcodes: Number(row.sold_tags ?? 0),
      soldQty: Number(row.sold_pieces ?? 0),
    }));

  return {
    period: validatedPeriod,
    counter: dailySalesSummaryService.ALL_COUNTER,
    data: data.map((row) => ({
      ...row,
      totalStock: row.totalBarcodes,
      totalStockPieces: row.totalQty,
      estimatedSold: row.soldQty,
    })),
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
