import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";
import { getActiveBatchId } from "./productBatchService.js";
import dailySalesSummaryService from "./dailySalesSummaryService.js";
import { batchProductsFrom } from "../utils/productQueryHelper.js";
import { TAG_EXPR } from "../utils/verificationScope.js";

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

const toDateKey = (value) => {
  if (value instanceof Date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  return String(value).slice(0, 10);
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

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const STOCKTAKE_HISTORY_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.DASHBOARD_STOCKTAKE_HISTORY_LIMIT ?? "6", 10) || 6,
);

const formatShortStocktakeDay = (value) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value ?? "");
  }

  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
};

const calculateAccuracyPercent = (foundCount, totalExpected) => {
  if (!totalExpected || totalExpected <= 0) {
    return 0;
  }

  return Number(((foundCount / totalExpected) * 100).toFixed(1));
};

const LOCATION_NAME_EXPR = `CASE
  WHEN counter_name IS NULL OR TRIM(counter_name) = '' THEN 'Unassigned'
  ELSE TRIM(counter_name)
END`;

const buildLocationLabel = (locationName, categoryName) => {
  if (!categoryName || categoryName === locationName) {
    return locationName;
  }

  return `${locationName} — ${categoryName}`;
};

const pickDominantProductByLocation = (rows) => {
  const map = new Map();

  for (const row of rows) {
    const location = row.location;
    const tagCount = Number(row.tagCount ?? 0);
    const existing = map.get(location);

    if (!existing || tagCount > existing.tagCount) {
      map.set(location, {
        product: row.product,
        tagCount,
      });
    }
  }

  return map;
};

const emptyCounterAccuracy = () => ({
  verificationDay: null,
  locations: [],
});

const getCounterAccuracy = async () => {
  const [batchId, latestDayRows] = await Promise.all([
    getActiveBatchId(),
    pool.execute(
      `SELECT MAX(verification_day) AS verificationDay
       FROM stock_verification`,
    ),
  ]);

  const verificationDay = latestDayRows[0][0]?.verificationDay ?? null;

  if (!batchId || !verificationDay) {
    return emptyCounterAccuracy();
  }

  const verificationDayKey = toDateKey(verificationDay);

  const [[expectedRows], [foundRows], [productRows]] = await Promise.all([
    pool.execute(
      `SELECT
         ${LOCATION_NAME_EXPR} AS location,
         COUNT(DISTINCT ${TAG_EXPR}) AS expected
       ${batchProductsFrom}
       GROUP BY ${LOCATION_NAME_EXPR}
       ORDER BY expected DESC, location ASC`,
      [batchId],
    ),
    pool.execute(
      `SELECT
         CASE
           WHEN svd.center_name IS NULL OR TRIM(svd.center_name) = '' THEN 'Unassigned'
           ELSE TRIM(svd.center_name)
         END AS location,
         COUNT(DISTINCT svd.tag_no) AS found
       FROM stock_verification_details svd
       INNER JOIN stock_verification sv ON sv.id = svd.verification_id
       WHERE sv.verification_day = ?
         AND svd.status = 'FOUND'
       GROUP BY location
       ORDER BY found DESC, location ASC`,
      [verificationDay],
    ),
    pool.execute(
      `SELECT
         ${LOCATION_NAME_EXPR} AS location,
         product,
         COUNT(*) AS tagCount
       ${batchProductsFrom}
       GROUP BY ${LOCATION_NAME_EXPR}, product
       ORDER BY location ASC, tagCount DESC`,
      [batchId],
    ),
  ]);

  const foundByLocation = new Map(
    foundRows.map((row) => [row.location, Number(row.found ?? 0)]),
  );
  const dominantProductByLocation = pickDominantProductByLocation(productRows);

  const locations = expectedRows.map((row) => {
    const name = row.location;
    const expected = Number(row.expected ?? 0);
    const found = foundByLocation.get(name) ?? 0;
    const missing = Math.max(expected - found, 0);
    const dominantProduct = dominantProductByLocation.get(name)?.product ?? null;

    return {
      name,
      label: buildLocationLabel(name, dominantProduct),
      category: dominantProduct,
      expected,
      found,
      missing,
      accuracyPercent: calculateAccuracyPercent(found, expected),
    };
  });

  return {
    verificationDay: verificationDayKey,
    locations,
  };
};

const isAllScopeRow = (row) =>
  row.product_name === ALL_PRODUCTS &&
  row.sub_product_name === ALL_SUB_PRODUCTS &&
  row.center_name === ALL_CENTERS;

const pickPreferredStocktakeRow = (rows) => {
  if (!rows.length) {
    return null;
  }

  const sorted = [...rows].sort((left, right) => {
    const leftPriority = isAllScopeRow(left) ? 0 : 1;
    const rightPriority = isAllScopeRow(right) ? 0 : 1;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return new Date(right.verification_date) - new Date(left.verification_date);
  });

  return sorted[0];
};

const formatStocktakeFrequency = (averageDays) => {
  if (averageDays === null || !Number.isFinite(averageDays)) {
    return null;
  }

  const rounded = Math.round(averageDays);

  if (rounded >= 4 && rounded <= 5) {
    return "Every 4–5 days";
  }

  if (rounded === 7) {
    return "Weekly";
  }

  if (rounded === 1) {
    return "Daily";
  }

  return `Every ${rounded} days`;
};

const emptyStocktakeHistory = () => ({
  sessions: [],
  sessionCount: 0,
  averageAccuracyPercent: 0,
  averageDurationMinutes: 0,
  frequencyLabel: null,
  averageFrequencyDays: null,
});

const fetchDurationMinutesByVerificationIds = async (verificationIds) => {
  if (verificationIds.length === 0) {
    return new Map();
  }

  const placeholders = verificationIds.map(() => "?").join(", ");
  const [detailRows, headerRows] = await Promise.all([
    pool.execute(
      `SELECT
         verification_id,
         GREATEST(TIMESTAMPDIFF(MINUTE, MIN(created_at), MAX(created_at)), 0) AS duration_minutes
       FROM stock_verification_details
       WHERE verification_id IN (${placeholders})
       GROUP BY verification_id`,
      verificationIds,
    ),
    pool.execute(
      `SELECT
         id AS verification_id,
         GREATEST(
           TIMESTAMPDIFF(MINUTE, created_at, COALESCE(updated_at, verification_date)),
           0
         ) AS duration_minutes
       FROM stock_verification
       WHERE id IN (${placeholders})`,
      verificationIds,
    ),
  ]);

  const map = new Map();

  for (const row of headerRows[0]) {
    map.set(Number(row.verification_id), Number(row.duration_minutes ?? 0));
  }

  for (const row of detailRows[0]) {
    const id = Number(row.verification_id);
    const detailDuration = Number(row.duration_minutes ?? 0);
    const headerDuration = map.get(id) ?? 0;
    map.set(id, Math.max(headerDuration, detailDuration));
  }

  return map;
};

const getStocktakeHistory = async () => {
  const [rows] = await pool.execute(
    `SELECT
       id,
       verification_day,
       verification_date,
       total_expected,
       found_count,
       total_scanned,
       missing_count,
       new_count,
       product_name,
       sub_product_name,
       center_name,
       created_at,
       updated_at
     FROM stock_verification
     ORDER BY verification_day DESC, verification_date DESC
     LIMIT 100`,
  );

  if (rows.length === 0) {
    return emptyStocktakeHistory();
  }

  const rowsByDay = new Map();

  for (const row of rows) {
    const dayKey = formatDate(row.verification_day);

    if (!rowsByDay.has(dayKey)) {
      rowsByDay.set(dayKey, []);
    }

    rowsByDay.get(dayKey).push(row);
  }

  const dayKeys = [...rowsByDay.keys()].sort((left, right) =>
    right.localeCompare(left),
  );
  const selectedDays = dayKeys.slice(0, STOCKTAKE_HISTORY_LIMIT);
  const sessions = selectedDays
    .map((dayKey) => pickPreferredStocktakeRow(rowsByDay.get(dayKey)))
    .filter(Boolean);

  const verificationIds = sessions.map((row) => Number(row.id));
  const durationMap = await fetchDurationMinutesByVerificationIds(verificationIds);

  const historySessions = sessions
    .map((row) => {
      const totalExpected = Number(row.total_expected ?? 0);
      const foundCount = Number(row.found_count ?? 0);
      const durationMinutes =
        durationMap.get(Number(row.id)) ??
        Math.max(
          0,
          Math.round(
            (new Date(row.updated_at ?? row.verification_date) -
              new Date(row.created_at ?? row.verification_date)) /
              60_000,
          ),
        );

      return {
        verificationId: Number(row.id),
        date: formatDate(row.verification_day),
        label: formatShortStocktakeDay(row.verification_day),
        accuracyPercent: calculateAccuracyPercent(foundCount, totalExpected),
        itemsScanned: Number(row.total_scanned ?? 0),
        totalExpected,
        foundCount,
        discrepancies:
          Number(row.missing_count ?? 0) + Number(row.new_count ?? 0),
        durationMinutes,
        completedAt: formatDateTime(row.verification_date),
      };
    })
    .sort((left, right) => left.date.localeCompare(right.date));

  const accuracyValues = historySessions
    .map((session) => session.accuracyPercent)
    .filter((value) => value > 0);
  const durationValues = historySessions
    .map((session) => session.durationMinutes)
    .filter((value) => value > 0);

  const averageAccuracyPercent =
    accuracyValues.length > 0
      ? Number(
          (
            accuracyValues.reduce((sum, value) => sum + value, 0) /
            accuracyValues.length
          ).toFixed(1),
        )
      : 0;

  const averageDurationMinutes =
    durationValues.length > 0
      ? Math.round(
          durationValues.reduce((sum, value) => sum + value, 0) /
            durationValues.length,
        )
      : 0;

  const dayTimestamps = historySessions
    .map((session) => new Date(`${session.date}T00:00:00`).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  const frequencyGaps = [];

  for (let index = 1; index < dayTimestamps.length; index += 1) {
    frequencyGaps.push(
      (dayTimestamps[index] - dayTimestamps[index - 1]) / 86_400_000,
    );
  }

  const averageFrequencyDays =
    frequencyGaps.length > 0
      ? Number(
          (
            frequencyGaps.reduce((sum, value) => sum + value, 0) /
            frequencyGaps.length
          ).toFixed(1),
        )
      : null;

  return {
    sessions: historySessions,
    sessionCount: historySessions.length,
    averageAccuracyPercent,
    averageDurationMinutes,
    frequencyLabel: formatStocktakeFrequency(averageFrequencyDays),
    averageFrequencyDays,
  };
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
  history: emptyStocktakeHistory(),
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
  const [monthResult, latestRow, history] = await Promise.all([
    pool.execute(
      `SELECT COUNT(DISTINCT verification_day) AS stocktakesThisMonth
       FROM stock_verification
       WHERE YEAR(verification_day) = YEAR(CURDATE())
         AND MONTH(verification_day) = MONTH(CURDATE())`,
    ),
    getLatestStocktakeRow(),
    getStocktakeHistory(),
  ]);

  const stocktakesThisMonth = Number(monthResult[0][0]?.stocktakesThisMonth ?? 0);

  if (!latestRow) {
    return {
      ...emptyStocktakeSummary(),
      stocktakesThisMonth,
      history,
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
    history,
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
  const [sumResult, stocktake, counterAccuracy] = await Promise.all([
    pool.execute(
      `SELECT
         COALESCE(SUM(found_count), 0) AS foundCount,
         COALESCE(SUM(missing_count), 0) AS missingCount,
         COALESCE(SUM(new_count), 0) AS newCount,
         COALESCE(SUM(found_count + missing_count + new_count), 0) AS totalRecords
       FROM stock_verification`,
    ),
    getStocktakeSummary(),
    getCounterAccuracy(),
  ]);

  const row = sumResult[0][0] ?? {};

  return {
    totalFound: Number(row.foundCount ?? 0),
    totalMissing: Number(row.missingCount ?? 0),
    totalNew: Number(row.newCount ?? 0),
    totalTags: Number(row.totalRecords ?? 0),
    stocktake,
    counterAccuracy,
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
  getStocktakeHistory,
  getCounterAccuracy,
};
