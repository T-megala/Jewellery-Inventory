import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";
import dailySalesSummaryService from "./dailySalesSummaryService.js";

const PRODUCT_DESCRIPTION_FILTER = `
  item_description IS NOT NULL
  AND TRIM(item_description) != ''
`;

const PRODUCT_BARCODE_FILTER = `
  barcode IS NOT NULL
  AND TRIM(barcode) != ''
  AND ${PRODUCT_DESCRIPTION_FILTER}
`;

const BATCH_PRODUCT_STATS_SUBQUERY = `
  SELECT
    batch_id,
    SUM(CASE WHEN barcode IS NOT NULL AND TRIM(barcode) != '' THEN 1 ELSE 0 END) AS total_barcodes,
    SUM(CASE WHEN barcode IS NULL OR TRIM(barcode) = '' THEN 1 ELSE 0 END) AS untagged_count,
    COALESCE(SUM(CASE WHEN barcode IS NOT NULL AND TRIM(barcode) != '' THEN closing_bal_qty ELSE 0 END), 0) AS total_qty,
    COUNT(DISTINCT CASE
      WHEN barcode IS NOT NULL AND TRIM(barcode) != '' THEN item_description
    END) AS item_descriptions
  FROM products
  WHERE ${PRODUCT_DESCRIPTION_FILTER.replace(/\n/g, " ")}
  GROUP BY batch_id
`;

const FUTURE_SEGMENTS = [
  {
    key: "warehouse",
    label: "Warehouse",
    description: "Central stock and inbound imports",
  },
  {
    key: "retail",
    label: "Retail",
    description: "Owned showroom operations",
  },
  {
    key: "franchise",
    label: "Franchise",
    description: "Partner store performance",
  },
];

const VALID_SEGMENT_TYPES = FUTURE_SEGMENTS.map((segment) => segment.key);
const RETAIL_ACCURACY_TARGET = 97;
const FRANCHISE_ACCURACY_THRESHOLD = 95;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
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

const emptyTypeMetrics = () => ({
  branchCount: 0,
  totalImportBatches: 0,
  activeBatchCount: 0,
  taggedProductCount: 0,
  untaggedProductCount: 0,
  totalStockQty: 0,
  productTypeCount: 0,
  soldQtyLast7Days: 0,
  soldTagsLast7Days: 0,
});

const emptyVerification = () => ({
  tagCounts: { foundCount: 0, missingCount: 0, newCount: 0 },
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
});

const emptyInwardPending = () => ({
  batches: [],
  inTransit: { found: 0, missing: 0, new: 0 },
  tagInventory: { tagged: 0, pending: 0, tagCoveragePct: 0 },
});

const buildWarehouseCards = (metrics, verificationData) => [
  { key: "totalStock", value: Number(metrics.totalStockQty ?? 0) },
  { key: "tagged", value: Number(metrics.taggedProductCount ?? 0) },
  { key: "pending", value: Number(metrics.untaggedProductCount ?? 0) },
  { key: "reject", value: Number(verificationData?.totalMissing ?? 0) },
];

const buildRetailCards = (metrics) => [
  { key: "totalStock", value: Number(metrics.totalStock ?? 0) },
  { key: "soldMtd", value: Number(metrics.soldMtd ?? 0) },
  { key: "shrinkageMtd", value: Number(metrics.shrinkageMtd ?? 0) },
  { key: "storesNeedingRestock", value: Number(metrics.storesNeedingRestock ?? 0) },
  { key: "avgStockAccuracy", value: Number(metrics.avgStockAccuracy ?? 0) },
  { key: "storeCount", value: Number(metrics.storeCount ?? 0) },
];

const buildFranchiseCards = (metrics) => [
  { key: "totalStock", value: Number(metrics.totalStock ?? 0) },
  { key: "partnerCount", value: Number(metrics.partnerCount ?? 0) },
  { key: "soldMtd", value: Number(metrics.soldMtd ?? 0) },
  { key: "shrinkageMtd", value: Number(metrics.shrinkageMtd ?? 0) },
  { key: "shrinkageRiskPct", value: Number(metrics.shrinkageRiskPct ?? 0) },
  { key: "pendingVerification", value: Number(metrics.pendingVerification ?? 0) },
  { key: "avgStockAccuracy", value: Number(metrics.avgStockAccuracy ?? 0) },
  { key: "accuracyThreshold", value: Number(metrics.accuracyThreshold ?? FRANCHISE_ACCURACY_THRESHOLD) },
];

const stockStatusFromDaysCover = (daysCover) => {
  if (daysCover <= 0) {
    return "restock";
  }

  if (daysCover < 14) {
    return "restock";
  }

  return "healthy";
};

const tableExists = async (tableName) => {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = ?
     LIMIT 1`,
    [tableName],
  );

  return rows.length > 0;
};

const tableHasColumn = async (tableName, columnName) => {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?
     LIMIT 1`,
    [tableName, columnName],
  );

  return rows.length > 0;
};

const resolveBranchTypeColumn = async () => {
  if (!(await tableExists("branches"))) {
    return null;
  }

  if (await tableHasColumn("branches", "branch_type")) {
    return "branch_type";
  }

  if (await tableHasColumn("branches", "type")) {
    return "type";
  }

  return null;
};

/** A segment is available when branches are tagged with that type and batches are branch-scoped. */
const isSegmentAvailable = async (segmentType) => {
  const typeColumn = await resolveBranchTypeColumn();

  if (!typeColumn) {
    return false;
  }

  if (!(await tableHasColumn("product_upload_batches", "branch_id"))) {
    return false;
  }

  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
     FROM branches
     WHERE LOWER(TRIM(${typeColumn})) = ?`,
    [segmentType],
  );

  return Number(rows[0]?.cnt ?? 0) > 0;
};

const fetchSegmentBranches = async (segmentType) => {
  const typeColumn = await resolveBranchTypeColumn();

  if (!typeColumn) {
    return [];
  }

  const [rows] = await pool.execute(
    `SELECT id, name
     FROM branches
     WHERE LOWER(TRIM(${typeColumn})) = ?
     ORDER BY name ASC`,
    [segmentType],
  );

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
  }));
};

const isRetailSegmentAvailable = () => isSegmentAvailable("retail");
const isFranchiseSegmentAvailable = () => isSegmentAvailable("franchise");
const fetchRetailStores = () => fetchSegmentBranches("retail");
const fetchFranchisePartners = () => fetchSegmentBranches("franchise");

const emptyRetailExecutivePayload = () => {
  const metrics = {
    totalStock: 0,
    storeCount: 0,
    soldMtd: 0,
    soldMtdTrendPct: null,
    shrinkageMtd: 0,
    shrinkageTrendPct: null,
    storesNeedingRestock: 0,
    restockStoreLabel: "",
    avgStockAccuracy: 0,
    accuracyTarget: RETAIL_ACCURACY_TARGET,
    accuracyAlert: "",
  };

  return {
    cards: buildRetailCards(metrics),
    overall: emptyTypeMetrics(),
    storeCount: 0,
    soldMtdTrendPct: null,
    shrinkageTrendPct: null,
    restockStoreLabel: "",
    accuracyTarget: RETAIL_ACCURACY_TARGET,
    accuracyAlert: "",
    storeStock: {
      accuracy: [],
      onHand: [],
      accuracyAlert: "",
      storeCount: 0,
      soldMtdTrendPct: null,
      accuracyTarget: RETAIL_ACCURACY_TARGET,
      restockStoreLabel: "",
    },
    movement: {
      inwardDaily: [],
      inwardLeadTime: [],
    },
    billingShrinkage: {
      performance: [],
      shrinkageByStore: [],
      categorySellThrough: [],
      shrinkageMtd: 0,
      easAlarmsToday: 0,
    },
    hardwareSync: {
      hardware: [],
      storeSync: [],
      sync: {
        pendingRecords: 0,
        failuresToday: 0,
        avgLastSyncMinutes: 0,
      },
    },
    outwardDaily: [],
    outwardSplit: { totalSold: 0, retail: 0, franchise: 0 },
    inwardPending: emptyInwardPending(),
    topSoldProducts: [],
    totalSoldQtyWeek: 0,
  };
};

const fetchBranchMetrics = async (branch) => {
  const [[stockRow]] = await pool.execute(
    `SELECT
       COALESCE(SUM(p.closing_bal_qty), 0) AS stockQty,
       COALESCE(SUM(CASE WHEN p.barcode IS NOT NULL AND TRIM(p.barcode) != '' THEN 1 ELSE 0 END), 0) AS taggedCount
     FROM products p
     INNER JOIN product_upload_batches b
       ON b.id = p.batch_id
      AND b.is_active = 1
      AND b.branch_id = ?
     WHERE ${PRODUCT_BARCODE_FILTER.replace(/\n/g, " ")}`,
    [branch.id],
  );

  const [[verificationRow]] = await pool.execute(
    `SELECT
       sv.found_count,
       sv.total_expected,
       sv.overall_verification_percentage
     FROM stock_verification sv
     INNER JOIN product_upload_batches b ON b.id = sv.batch_id
     WHERE b.branch_id = ?
       AND b.is_active = 1
     ORDER BY sv.verification_day DESC, sv.verification_date DESC, sv.id DESC
     LIMIT 1`,
    [branch.id],
  );

  const [[soldMtdRow]] = await pool.execute(
    `SELECT COALESCE(SUM(dss.sold_pieces), 0) AS soldMtd
     FROM daily_sales_summary dss
     INNER JOIN product_upload_batches b ON b.id = dss.batch_id
     WHERE b.branch_id = ?
       AND dss.counter_name = ?
       AND YEAR(dss.batch_date) = YEAR(CURDATE())
       AND MONTH(dss.batch_date) = MONTH(CURDATE())`,
    [branch.id, dailySalesSummaryService.ALL_COUNTER],
  );

  const [[soldWeekRow]] = await pool.execute(
    `SELECT COALESCE(SUM(dss.sold_pieces), 0) AS soldQty
     FROM daily_sales_summary dss
     INNER JOIN product_upload_batches b ON b.id = dss.batch_id
     WHERE b.branch_id = ?
       AND dss.counter_name = ?
       AND dss.batch_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
    [branch.id, dailySalesSummaryService.ALL_COUNTER],
  );

  const stock = Number(stockRow?.stockQty ?? 0);
  const soldMtd = Number(soldMtdRow?.soldMtd ?? 0);
  const soldWeek = Number(soldWeekRow?.soldQty ?? 0);
  const totalExpected = Number(verificationRow?.total_expected ?? 0);
  const foundCount = Number(verificationRow?.found_count ?? 0);
  const accuracyPct =
    totalExpected > 0
      ? Number(((foundCount / totalExpected) * 100).toFixed(2))
      : Number(verificationRow?.overall_verification_percentage ?? 0);
  const dailySoldRate = soldWeek > 0 ? soldWeek / 7 : 0;
  const daysCover =
    dailySoldRate > 0 ? Number((stock / dailySoldRate).toFixed(1)) : stock > 0 ? 30 : 0;
  const status = stockStatusFromDaysCover(daysCover);

  return {
    name: branch.name,
    stock,
    daysCover,
    status,
    accuracyPct,
    leadTimeHours: 0,
    billsToday: 0,
    avgTimeSec: 0,
    errorPct: 0,
    shrinkagePcs: 0,
    lastSync: "0 min ago",
    syncStatus: "ok",
    soldMtd,
    soldWeek,
    taggedCount: Number(stockRow?.taggedCount ?? 0),
  };
};

const fetchSegmentInwardDaily = async (branchIds) => {
  if (branchIds.length === 0) {
    return [];
  }

  const placeholders = branchIds.map(() => "?").join(", ");
  const [rows] = await pool.execute(
    `SELECT
       b.batch_date,
       COALESCE(SUM(stats.total_qty), 0) AS inwardQty
     FROM product_upload_batches b
     LEFT JOIN (${BATCH_PRODUCT_STATS_SUBQUERY}) stats ON stats.batch_id = b.id
     WHERE b.branch_id IN (${placeholders})
       AND b.batch_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
     GROUP BY b.batch_date
     ORDER BY b.batch_date ASC`,
    branchIds,
  );

  return rows.map((row) => ({
    date: toDateKey(row.batch_date),
    day: formatDayLabel(row.batch_date),
    qty: Number(row.inwardQty ?? 0),
  }));
};

const fetchSegmentCategorySellThrough = async (branchIds) => {
  if (branchIds.length === 0) {
    return [];
  }

  const hasIsaDescription = await tableHasColumn(
    "inventory_sales_audit",
    "item_description",
  );
  const productColumn = hasIsaDescription ? "item_description" : "product";

  if (!(await tableHasColumn("inventory_sales_audit", productColumn))) {
    return [];
  }

  const placeholders = branchIds.map(() => "?").join(", ");
  const soldQtyColumn = (await tableHasColumn("inventory_sales_audit", "sold_qty"))
    ? "sold_qty"
    : "sold_pieces";

  const [rows] = await pool.execute(
    `SELECT
       isa.${productColumn} AS categoryName,
       COALESCE(SUM(isa.${soldQtyColumn}), 0) AS soldQty
     FROM inventory_sales_audit isa
     INNER JOIN product_upload_batches b ON b.id = isa.batch_id
     WHERE b.branch_id IN (${placeholders})
       AND isa.${productColumn} IS NOT NULL
       AND TRIM(isa.${productColumn}) != ''
       AND YEAR(b.batch_date) = YEAR(CURDATE())
       AND MONTH(b.batch_date) = MONTH(CURDATE())
     GROUP BY isa.${productColumn}
     HAVING soldQty > 0
     ORDER BY soldQty DESC
     LIMIT 6`,
    branchIds,
  );

  const total = rows.reduce((sum, row) => sum + Number(row.soldQty ?? 0), 0);

  return rows.map((row) => {
    const value = Number(row.soldQty ?? 0);
    return {
      name: row.categoryName,
      value,
      pct: total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0,
    };
  });
};

const buildRetailExecutivePayloadFromDb = async () => {
  const stores = await fetchRetailStores();
  const storeMetrics = await Promise.all(
    stores.map((store) => fetchBranchMetrics(store)),
  );

  const branchIds = stores.map((store) => store.id);
  const totalStock = storeMetrics.reduce((sum, row) => sum + row.stock, 0);
  const soldMtd = storeMetrics.reduce((sum, row) => sum + row.soldMtd, 0);
  const soldWeek = storeMetrics.reduce((sum, row) => sum + row.soldWeek, 0);
  const accuracyValues = storeMetrics
    .map((row) => row.accuracyPct)
    .filter((value) => value > 0);
  const avgStockAccuracy =
    accuracyValues.length > 0
      ? Number(
          (
            accuracyValues.reduce((sum, value) => sum + value, 0) /
            accuracyValues.length
          ).toFixed(2),
        )
      : 0;

  const restockStores = storeMetrics.filter((row) => row.status === "restock");
  const storesNeedingRestock = restockStores.length;
  const restockStoreLabel = restockStores
    .slice(0, 2)
    .map((row) => row.name)
    .join(", ");

  const lowAccuracyStores = storeMetrics.filter(
    (row) => row.accuracyPct > 0 && row.accuracyPct < RETAIL_ACCURACY_TARGET,
  );
  const accuracyAlert =
    lowAccuracyStores.length > 0
      ? `${lowAccuracyStores.map((row) => row.name).join(", ")} below ${RETAIL_ACCURACY_TARGET}% accuracy target.`
      : "";

  const inwardDaily = await fetchSegmentInwardDaily(branchIds);
  const categorySellThrough = await fetchSegmentCategorySellThrough(branchIds);

  const metrics = {
    totalStock,
    storeCount: stores.length,
    soldMtd,
    soldMtdTrendPct: null,
    shrinkageMtd: 0,
    shrinkageTrendPct: null,
    storesNeedingRestock,
    restockStoreLabel,
    avgStockAccuracy,
    accuracyTarget: RETAIL_ACCURACY_TARGET,
    accuracyAlert,
  };

  const accuracyRows = storeMetrics.map((row) => ({
    store: row.name,
    accuracyPct: row.accuracyPct,
  }));

  const stockRows = storeMetrics.map((row) => ({
    store: row.name,
    stock: row.stock,
    daysCover: row.daysCover,
    status: row.status,
  }));

  return {
    cards: buildRetailCards(metrics),
    overall: {
      ...emptyTypeMetrics(),
      branchCount: stores.length,
      totalStockQty: totalStock,
      taggedProductCount: storeMetrics.reduce(
        (sum, row) => sum + row.taggedCount,
        0,
      ),
      soldQtyLast7Days: soldWeek,
    },
    storeCount: stores.length,
    soldMtdTrendPct: null,
    shrinkageTrendPct: null,
    restockStoreLabel,
    accuracyTarget: RETAIL_ACCURACY_TARGET,
    accuracyAlert,
    storeStock: {
      accuracy: accuracyRows,
      onHand: stockRows,
      accuracyAlert,
      storeCount: stores.length,
      soldMtdTrendPct: null,
      accuracyTarget: RETAIL_ACCURACY_TARGET,
      restockStoreLabel,
    },
    movement: {
      inwardDaily,
      inwardLeadTime: storeMetrics.map((row) => ({
        store: row.name,
        leadTimeHours: row.leadTimeHours,
      })),
    },
    billingShrinkage: {
      performance: storeMetrics.map((row) => ({
        store: row.name,
        billsToday: row.billsToday,
        avgTimeSec: row.avgTimeSec,
        errorPct: row.errorPct,
      })),
      shrinkageByStore: storeMetrics.map((row) => ({
        store: row.name,
        shrinkagePcs: row.shrinkagePcs,
      })),
      categorySellThrough,
      shrinkageMtd: 0,
      easAlarmsToday: 0,
    },
    hardwareSync: {
      hardware: [],
      storeSync: storeMetrics.map((row) => ({
        store: row.name,
        lastSync: row.lastSync,
        syncStatus: row.syncStatus,
      })),
      sync: {
        pendingRecords: 0,
        failuresToday: 0,
        avgLastSyncMinutes: 0,
      },
    },
    outwardDaily: [],
    outwardSplit: { totalSold: soldWeek, retail: soldWeek, franchise: 0 },
    inwardPending: emptyInwardPending(),
    topSoldProducts: [],
    totalSoldQtyWeek: soldWeek,
  };
};

const buildRetailExecutiveDashboard = async () => {
  const available = await isRetailSegmentAvailable();
  const base = {
    type: "retail",
    status: available ? "active" : "empty",
    label: "Retail Stores",
    segments: FUTURE_SEGMENTS,
  };

  if (!available) {
    return base;
  }

  const payload = await buildRetailExecutivePayloadFromDb();

  return {
    ...base,
    ...payload,
  };
};

const buildWarehouseExecutiveDashboard = async ({
  getDayWiseSales,
  getVerificationSummary,
}) => {
  const [[overallRow]] = await pool.execute(
    `SELECT
       COUNT(DISTINCT b.id) AS totalImportBatches,
       SUM(CASE WHEN b.is_active = 1 THEN 1 ELSE 0 END) AS activeBatchCount,
       COALESCE(SUM(CASE WHEN b.is_active = 1 THEN stats.total_barcodes ELSE 0 END), 0) AS taggedProductCount,
       COALESCE(SUM(CASE WHEN b.is_active = 1 THEN stats.untagged_count ELSE 0 END), 0) AS untaggedProductCount,
       COALESCE(SUM(CASE WHEN b.is_active = 1 THEN stats.total_qty ELSE 0 END), 0) AS totalStockQty,
       COALESCE(SUM(CASE WHEN b.is_active = 1 THEN stats.item_descriptions ELSE 0 END), 0) AS productTypeCount
     FROM product_upload_batches b
     LEFT JOIN (${BATCH_PRODUCT_STATS_SUBQUERY}) stats ON stats.batch_id = b.id`,
  );

  const [batchRows] = await pool.execute(
    `SELECT
       b.id,
       b.batch_date,
       b.uploaded_at,
       b.uploaded_by,
       b.is_active,
       COALESCE(stats.total_barcodes, 0) AS taggedProductCount,
       COALESCE(stats.untagged_count, 0) AS untaggedProductCount,
       COALESCE(stats.total_qty, 0) AS totalStockQty,
       COALESCE(stats.item_descriptions, 0) AS productTypeCount
     FROM product_upload_batches b
     LEFT JOIN (${BATCH_PRODUCT_STATS_SUBQUERY}) stats ON stats.batch_id = b.id
     ORDER BY b.id DESC
     LIMIT 20`,
  );

  const [weekSalesRows] = await pool.execute(
    `SELECT
       COALESCE(SUM(sold_pieces), 0) AS soldQty,
       COALESCE(SUM(sold_tags), 0) AS soldBarcodes
     FROM daily_sales_summary
     WHERE counter_name = ?
       AND batch_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
    [dailySalesSummaryService.ALL_COUNTER],
  );

  const [dayWiseSales, verification] = await Promise.all([
    getDayWiseSales({ period: "week" }),
    getVerificationSummary(),
  ]);

  const overall = {
    branchCount: 1,
    totalImportBatches: Number(overallRow?.totalImportBatches ?? 0),
    activeBatchCount: Number(overallRow?.activeBatchCount ?? 0),
    taggedProductCount: Number(overallRow?.taggedProductCount ?? 0),
    untaggedProductCount: Number(overallRow?.untaggedProductCount ?? 0),
    totalStockQty: Number(overallRow?.totalStockQty ?? 0),
    productTypeCount: Number(overallRow?.productTypeCount ?? 0),
    soldQtyLast7Days: Number(weekSalesRows[0]?.soldQty ?? 0),
    soldTagsLast7Days: Number(weekSalesRows[0]?.soldBarcodes ?? 0),
  };

  const tagged = overall.taggedProductCount;
  const pending = overall.untaggedProductCount;
  const tagCoveragePct =
    tagged > 0 ? Number(((tagged / (tagged + pending)) * 100).toFixed(1)) : 0;

  return {
    type: "warehouse",
    status: "active",
    label: "Warehouse",
    segments: FUTURE_SEGMENTS,
    cards: buildWarehouseCards(overall, verification),
    overall,
    outwardDaily: dayWiseSales.data.map((row) => ({
      date: row.date,
      day: row.day,
      soldQty: Number(row.soldQty ?? 0),
    })),
    outwardSplit: {
      totalSold: Number(dayWiseSales.totalSoldQty ?? 0),
      retail: 0,
      franchise: 0,
    },
    inwardPending: {
      batches: batchRows.map((row) => ({
        id: Number(row.id),
        batchDate: formatDate(row.batch_date),
        totalStockQty: Number(row.totalStockQty ?? 0),
        isActive: Boolean(row.is_active),
      })),
      inTransit: {
        found: Number(verification.totalFound ?? 0),
        missing: Number(verification.totalMissing ?? 0),
        new: Number(verification.totalNew ?? 0),
      },
      tagInventory: {
        tagged,
        pending,
        tagCoveragePct,
      },
    },
    topSoldProducts: [],
    totalSoldQtyWeek: Number(dayWiseSales.totalSoldQty ?? 0),
  };
};

const emptyFranchiseExecutivePayload = () => {
  const metrics = {
    totalStock: 0,
    partnerCount: 0,
    soldMtd: 0,
    shrinkageMtd: 0,
    shrinkageRiskPct: 0,
    pendingVerification: 0,
    avgStockAccuracy: 0,
    accuracyThreshold: FRANCHISE_ACCURACY_THRESHOLD,
  };

  return {
    cards: buildFranchiseCards(metrics),
    overall: emptyTypeMetrics(),
    partnerCount: 0,
    soldMtdTrendPct: null,
    shrinkageRiskPct: 0,
    pendingVerificationLabel: "",
    accuracyThreshold: FRANCHISE_ACCURACY_THRESHOLD,
    accuracyAlert: "",
    stockCoverAlert: "",
    inTransitAlert: "",
    billingAlert: "",
    shrinkageMtd: 0,
    shrinkagePct: 0,
    shrinkageComment: "",
    partnerStock: {
      accuracy: [],
      onHand: [],
      accuracyAlert: "",
      stockCoverAlert: "",
      partnerCount: 0,
      soldMtdTrendPct: null,
      pendingVerificationLabel: "",
      accuracyThreshold: FRANCHISE_ACCURACY_THRESHOLD,
    },
    movement: {
      inwardDaily: [],
      inTransitDCs: [],
      inTransitAlert: "",
    },
    billingShrinkage: {
      performance: [],
      shrinkageByPartner: [],
      categorySellThrough: [],
      shrinkageMtd: 0,
      shrinkagePct: 0,
      shrinkageComment: "",
      billingAlert: "",
    },
    hardwareSync: {
      hardware: [],
      partnerSync: [],
      sync: {
        pendingRecords: 0,
        failuresToday: 0,
        avgLastSyncMinutes: 0,
      },
    },
    outwardDaily: [],
    outwardSplit: { totalSold: 0, retail: 0, franchise: 0 },
    inwardPending: emptyInwardPending(),
    topSoldProducts: [],
    totalSoldQtyWeek: 0,
  };
};

const buildFranchiseExecutivePayloadFromDb = async () => {
  const partners = await fetchFranchisePartners();
  const partnerMetrics = await Promise.all(
    partners.map((partner) => fetchBranchMetrics(partner)),
  );

  const branchIds = partners.map((partner) => partner.id);
  const totalStock = partnerMetrics.reduce((sum, row) => sum + row.stock, 0);
  const soldMtd = partnerMetrics.reduce((sum, row) => sum + row.soldMtd, 0);
  const soldWeek = partnerMetrics.reduce((sum, row) => sum + row.soldWeek, 0);
  const accuracyValues = partnerMetrics
    .map((row) => row.accuracyPct)
    .filter((value) => value > 0);
  const avgStockAccuracy =
    accuracyValues.length > 0
      ? Number(
          (
            accuracyValues.reduce((sum, value) => sum + value, 0) /
            accuracyValues.length
          ).toFixed(2),
        )
      : 0;

  const restockPartners = partnerMetrics.filter(
    (row) => row.status === "restock",
  );
  const stockCoverAlert =
    restockPartners.length > 0
      ? `${restockPartners.map((row) => row.name).join(", ")} running low on stock cover.`
      : "";

  const lowAccuracyPartners = partnerMetrics.filter(
    (row) => row.accuracyPct > 0 && row.accuracyPct < FRANCHISE_ACCURACY_THRESHOLD,
  );
  const accuracyAlert =
    lowAccuracyPartners.length > 0
      ? `${lowAccuracyPartners.map((row) => row.name).join(", ")} below ${FRANCHISE_ACCURACY_THRESHOLD}% accuracy threshold.`
      : "";

  // Partners with no verification record yet are treated as pending verification.
  const pendingPartners = partnerMetrics.filter((row) => row.accuracyPct <= 0);
  const pendingVerification = pendingPartners.length;
  const pendingVerificationLabel =
    pendingVerification > 0
      ? `${pendingVerification} partner${pendingVerification > 1 ? "s" : ""} awaiting scan`
      : "";

  const inwardDaily = await fetchSegmentInwardDaily(branchIds);
  const categorySellThrough = await fetchSegmentCategorySellThrough(branchIds);

  const metrics = {
    totalStock,
    partnerCount: partners.length,
    soldMtd,
    shrinkageMtd: 0,
    shrinkageRiskPct: 0,
    pendingVerification,
    avgStockAccuracy,
    accuracyThreshold: FRANCHISE_ACCURACY_THRESHOLD,
  };

  const accuracyRows = partnerMetrics.map((row) => ({
    partner: row.name,
    accuracyPct: row.accuracyPct,
  }));

  const stockRows = partnerMetrics.map((row) => ({
    partner: row.name,
    stock: row.stock,
    daysCover: row.daysCover,
    status: row.status,
  }));

  return {
    cards: buildFranchiseCards(metrics),
    overall: {
      ...emptyTypeMetrics(),
      branchCount: partners.length,
      totalStockQty: totalStock,
      taggedProductCount: partnerMetrics.reduce(
        (sum, row) => sum + row.taggedCount,
        0,
      ),
      soldQtyLast7Days: soldWeek,
    },
    partnerCount: partners.length,
    soldMtdTrendPct: null,
    shrinkageRiskPct: 0,
    pendingVerificationLabel,
    accuracyThreshold: FRANCHISE_ACCURACY_THRESHOLD,
    accuracyAlert,
    stockCoverAlert,
    inTransitAlert: "",
    billingAlert: "",
    shrinkageMtd: 0,
    shrinkagePct: 0,
    shrinkageComment: "",
    partnerStock: {
      accuracy: accuracyRows,
      onHand: stockRows,
      accuracyAlert,
      stockCoverAlert,
      partnerCount: partners.length,
      soldMtdTrendPct: null,
      pendingVerificationLabel,
      accuracyThreshold: FRANCHISE_ACCURACY_THRESHOLD,
    },
    movement: {
      inwardDaily,
      inTransitDCs: [],
      inTransitAlert: "",
    },
    billingShrinkage: {
      performance: partnerMetrics.map((row) => ({
        partner: row.name,
        billsToday: row.billsToday,
        avgTimeSec: row.avgTimeSec,
        errorPct: row.errorPct,
      })),
      shrinkageByPartner: partnerMetrics.map((row) => ({
        partner: row.name,
        shrinkagePcs: row.shrinkagePcs,
      })),
      categorySellThrough,
      shrinkageMtd: 0,
      shrinkagePct: 0,
      shrinkageComment: "",
      billingAlert: "",
    },
    hardwareSync: {
      hardware: [],
      partnerSync: partnerMetrics.map((row) => ({
        partner: row.name,
        lastSync: row.lastSync,
        syncStatus: row.syncStatus === "ok" ? "live" : row.syncStatus,
      })),
      sync: {
        pendingRecords: 0,
        failuresToday: 0,
        avgLastSyncMinutes: 0,
      },
    },
    outwardDaily: [],
    outwardSplit: { totalSold: soldWeek, retail: 0, franchise: soldWeek },
    inwardPending: emptyInwardPending(),
    topSoldProducts: [],
    totalSoldQtyWeek: soldWeek,
  };
};

const buildFranchiseExecutiveDashboard = async () => {
  const available = await isFranchiseSegmentAvailable();
  const base = {
    type: "franchise",
    status: available ? "active" : "empty",
    label: "Franchise",
    segments: FUTURE_SEGMENTS,
  };

  if (!available) {
    return base;
  }

  const payload = await buildFranchiseExecutivePayloadFromDb();

  return {
    ...base,
    ...payload,
  };
};

export const getExecutiveDashboard = async ({
  type = "warehouse",
  getDayWiseSales,
  getVerificationSummary,
} = {}) => {
  const requestedType = String(type ?? "warehouse").trim().toLowerCase();

  if (!VALID_SEGMENT_TYPES.includes(requestedType)) {
    throw new ApiError(
      400,
      `Invalid type "${type}". Valid types: ${VALID_SEGMENT_TYPES.join(", ")}`,
    );
  }

  if (requestedType === "retail") {
    const retailPayload = await buildRetailExecutiveDashboard();
    const available = retailPayload.status === "active";

    return {
      ...retailPayload,
      ...(available ? {} : emptyRetailExecutivePayload()),
    };
  }

  if (requestedType === "franchise") {
    const franchisePayload = await buildFranchiseExecutiveDashboard();
    const available = franchisePayload.status === "active";

    return {
      ...franchisePayload,
      ...(available ? {} : emptyFranchiseExecutivePayload()),
    };
  }

  return buildWarehouseExecutiveDashboard({
    getDayWiseSales,
    getVerificationSummary,
  });
};

export default {
  getExecutiveDashboard,
  isRetailSegmentAvailable,
  isFranchiseSegmentAvailable,
  emptyRetailExecutivePayload,
  emptyFranchiseExecutivePayload,
};
