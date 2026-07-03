import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";
import {
  getActiveBatchId,
  getActiveBatchIdsForBranches,
  getPreviousBatchIdMapForBranches,
  getRecentBatchIdsForBranches,
} from "./productBatchService.js";
import branchService from "./branchService.js";
import dailySalesSummaryService from "./dailySalesSummaryService.js";
import {
  batchProductsFrom,
  batchAllProductsFrom,
} from "../utils/productQueryHelper.js";
import { TAG_EXPR, buildInventoryScopeFilterFromStoredLabels } from "../utils/verificationScope.js";
import {
  activeBranchProductsJoin,
  activeBranchProductsWhere,
  buildBranchSqlFilter,
  normalizeBranchIds,
} from "../utils/branchScope.js";

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
  taggedTags: 0,
  untaggedTags: 0,
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
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
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
  Number.parseInt(process.env.DASHBOARD_STOCKTAKE_HISTORY_LIMIT ?? "6", 10) ||
    6,
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

  return Number(((foundCount / totalExpected) * 100).toFixed(2));
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

const emptyCounterAccuracy = () => ({
  verificationDay: null,
  locations: [],
});

const getCounterAccuracy = async ({
  branchId = null,
  branchIds = null,
} = {}) => {
  const scope = normalizeBranchIds({ branchId, branchIds });
  const latestRows = await getPreferredStocktakeRowsPerBranch(scope);
  const activeBatchByBranch = await getActiveBatchIdByBranch(scope);

  if (latestRows.length === 0 || activeBatchByBranch.size === 0) {
    return emptyCounterAccuracy();
  }

  const scopeMultiple = scope.length > 1;
  const branches = scopeMultiple
    ? await branchService.getBranchesByIds(scope)
    : [];
  const branchNameById = new Map(
    branches.map((branch) => [branch.id, branch.name]),
  );

  const verificationDayKey = [...latestRows]
    .map((row) => toDateKey(row.verification_day))
    .sort()
    .reverse()[0];

  const expectedByLocation = new Map();
  const foundByLocation = new Map();
  const dominantProductByLocation = new Map();

  for (const stocktakeRow of latestRows) {
    const branchKey = Number(stocktakeRow.branch_id);
    const batchId = activeBatchByBranch.get(branchKey);

    if (!batchId) {
      continue;
    }

    const branchName = branchNameById.get(branchKey) ?? `Branch ${branchKey}`;

    const [[expectedRows], [foundRows], [productRows]] = await Promise.all([
      pool.execute(
        `SELECT
           ${LOCATION_NAME_EXPR} AS location,
           COUNT(DISTINCT ${TAG_EXPR}) AS expected
         FROM products
         WHERE batch_id = ?
           AND ${PRODUCT_TAG_FILTER.replace(/\n\s*/g, " ")}
         GROUP BY ${LOCATION_NAME_EXPR}`,
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
           AND sv.branch_id = ?
           AND svd.status = 'FOUND'
         GROUP BY location`,
        [stocktakeRow.verification_day, branchKey],
      ),
      pool.execute(
        `SELECT
           ${LOCATION_NAME_EXPR} AS location,
           product,
           COUNT(*) AS tagCount
         FROM products
         WHERE batch_id = ?
           AND ${PRODUCT_TAG_FILTER.replace(/\n\s*/g, " ")}
         GROUP BY ${LOCATION_NAME_EXPR}, product`,
        [batchId],
      ),
    ]);

    for (const row of expectedRows) {
      const scopedLocation = buildScopedLocationName(
        row.location,
        branchName,
        scopeMultiple,
      );
      expectedByLocation.set(
        scopedLocation,
        (expectedByLocation.get(scopedLocation) ?? 0) + Number(row.expected ?? 0),
      );
    }

    for (const row of foundRows) {
      const scopedLocation = buildScopedLocationName(
        row.location,
        branchName,
        scopeMultiple,
      );
      foundByLocation.set(
        scopedLocation,
        (foundByLocation.get(scopedLocation) ?? 0) + Number(row.found ?? 0),
      );
    }

    for (const row of productRows) {
      const scopedLocation = buildScopedLocationName(
        row.location,
        branchName,
        scopeMultiple,
      );
      const tagCount = Number(row.tagCount ?? 0);
      const existing = dominantProductByLocation.get(scopedLocation);

      if (!existing || tagCount > existing.tagCount) {
        dominantProductByLocation.set(scopedLocation, {
          product: row.product,
          tagCount,
        });
      }
    }
  }

  const locations = [...expectedByLocation.entries()]
    .map(([name, expected]) => {
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
    })
    .sort(
      (left, right) =>
        right.expected - left.expected || left.name.localeCompare(right.name),
    );

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

const getPreferredStocktakeRowsPerBranch = async (branchIds = []) => {
  const scope = normalizeBranchIds({ branchIds });

  if (scope.length === 0) {
    return [];
  }

  const branchFilter = buildBranchSqlFilter("branch_id", scope, {
    keyword: "WHERE",
  });

  const [rows] = await pool.execute(
    `SELECT
       sv.id,
       sv.verification_date,
       sv.verification_day,
       sv.total_expected,
       sv.total_scanned,
       sv.found_count,
       sv.missing_count,
       sv.new_count,
       sv.product_name,
       sv.sub_product_name,
       sv.center_name,
       sv.branch_id
     FROM stock_verification sv
     INNER JOIN (
       SELECT branch_id, MAX(verification_day) AS verification_day
       FROM stock_verification
       ${branchFilter.clause}
       GROUP BY branch_id
     ) latest
       ON latest.branch_id = sv.branch_id
      AND latest.verification_day = sv.verification_day
     ORDER BY sv.branch_id ASC,
       CASE
         WHEN sv.product_name = ?
          AND sv.sub_product_name = ?
          AND sv.center_name = ?
         THEN 0
         ELSE 1
       END,
       sv.verification_date DESC,
       sv.id DESC`,
    [
      ...branchFilter.params,
      ALL_PRODUCTS,
      ALL_SUB_PRODUCTS,
      ALL_CENTERS,
    ],
  );

  const byBranch = new Map();

  for (const row of rows) {
    const branchId = Number(row.branch_id);

    if (!byBranch.has(branchId)) {
      byBranch.set(branchId, row);
    }
  }

  return scope
    .map((branchId) => byBranch.get(branchId))
    .filter((row) => row !== undefined);
};

const aggregateStocktakeRowsToRow = (rows) => {
  if (!rows.length) {
    return null;
  }

  if (rows.length === 1) {
    return rows[0];
  }

  const sortedByDate = [...rows].sort(
    (left, right) =>
      new Date(right.verification_date) - new Date(left.verification_date),
  );
  const latest = sortedByDate[0];

  return {
    id: latest.id,
    verification_date: latest.verification_date,
    verification_day: latest.verification_day,
    total_expected: rows.reduce(
      (sum, row) => sum + Number(row.total_expected ?? 0),
      0,
    ),
    total_scanned: rows.reduce(
      (sum, row) => sum + Number(row.total_scanned ?? 0),
      0,
    ),
    found_count: rows.reduce(
      (sum, row) => sum + Number(row.found_count ?? 0),
      0,
    ),
    missing_count: rows.reduce(
      (sum, row) => sum + Number(row.missing_count ?? 0),
      0,
    ),
    new_count: rows.reduce(
      (sum, row) => sum + Number(row.new_count ?? 0),
      0,
    ),
    product_name: ALL_PRODUCTS,
    sub_product_name: ALL_SUB_PRODUCTS,
    center_name: ALL_CENTERS,
    branch_id: null,
  };
};

const computeExpectedTagCountForStocktake = async (row) => {
  const branchId = Number(row.branch_id);

  if (!branchId) {
    return Number(row.total_expected ?? 0);
  }

  const activeBatchId = await getActiveBatchId(branchId);

  if (!activeBatchId) {
    return Number(row.total_expected ?? 0);
  }

  const scope = buildInventoryScopeFilterFromStoredLabels(
    activeBatchId,
    row.product_name,
    row.sub_product_name,
    row.center_name,
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(DISTINCT ${TAG_EXPR}) AS total
     FROM products
     WHERE ${scope.whereClause}`,
    scope.params,
  );

  return Number(countRows[0]?.total ?? 0);
};

const reconcileStocktakeRowCounts = async (row) => {
  if (!row) {
    return null;
  }

  const totalExpected = await computeExpectedTagCountForStocktake(row);
  const foundCount = Number(row.found_count ?? 0);
  const newCount = Number(row.new_count ?? 0);
  const missingCount = Math.max(totalExpected - foundCount, 0);

  return {
    ...row,
    total_expected: totalExpected,
    found_count: foundCount,
    missing_count: missingCount,
    new_count: newCount,
  };
};

const getActiveBatchIdByBranch = async (branchIds = []) => {
  const scope = normalizeBranchIds({ branchIds });

  if (scope.length === 0) {
    return new Map();
  }

  const placeholders = scope.map(() => "?").join(", ");
  const [rows] = await pool.execute(
    `SELECT id, branch_id
     FROM product_upload_batches
     WHERE branch_id IN (${placeholders})
       AND is_active = 1`,
    scope,
  );

  return new Map(rows.map((row) => [Number(row.branch_id), Number(row.id)]));
};

const buildScopedLocationName = (location, branchName, scopeMultiple) =>
  scopeMultiple ? `${branchName} — ${location}` : location;

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

const getStocktakeHistory = async ({
  branchId = null,
  branchIds = null,
} = {}) => {
  const scope = normalizeBranchIds({ branchId, branchIds });
  const branchFilter = buildBranchSqlFilter("branch_id", scope, {
    keyword: "WHERE",
  });

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
       branch_id,
       created_at,
       updated_at
     FROM stock_verification
     ${branchFilter.clause}
     ORDER BY verification_day DESC, verification_date DESC
     LIMIT 500`,
    branchFilter.params,
  );

  if (rows.length === 0) {
    return emptyStocktakeHistory();
  }

  const rowsByDay = new Map();

  for (const row of rows) {
    const dayKey = formatDate(row.verification_day);

    if (!rowsByDay.has(dayKey)) {
      rowsByDay.set(dayKey, new Map());
    }

    const branchId = Number(row.branch_id);
    const dayBranches = rowsByDay.get(dayKey);

    if (!dayBranches.has(branchId)) {
      dayBranches.set(branchId, []);
    }

    dayBranches.get(branchId).push(row);
  }

  const dayKeys = [...rowsByDay.keys()].sort((left, right) =>
    right.localeCompare(left),
  );
  const selectedDays = dayKeys.slice(0, STOCKTAKE_HISTORY_LIMIT);
  const sessions = (
    await Promise.all(
      selectedDays.map(async (dayKey) => {
        const branchMaps = rowsByDay.get(dayKey);
        const pickedRows = [];

        for (const branchRows of branchMaps.values()) {
          const picked = pickPreferredStocktakeRow(branchRows);

          if (picked) {
            pickedRows.push(picked);
          }
        }

        const reconciledRows = await Promise.all(
          pickedRows.map(reconcileStocktakeRowCounts),
        );

        return aggregateStocktakeRowsToRow(reconciledRows.filter(Boolean));
      }),
    )
  ).filter(Boolean);

  const verificationIds = sessions.map((row) => Number(row.id));
  const durationMap =
    await fetchDurationMinutesByVerificationIds(verificationIds);

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

const getLatestStocktakeRow = async ({
  branchId = null,
  branchIds = null,
} = {}) => {
  const scope = normalizeBranchIds({ branchId, branchIds });
  const rows = await getPreferredStocktakeRowsPerBranch(scope);
  const reconciledRows = await Promise.all(
    rows.map(reconcileStocktakeRowCounts),
  );

  return aggregateStocktakeRowsToRow(reconciledRows.filter(Boolean));
};

const getStocktakeSummary = async ({
  branchId = null,
  branchIds = null,
} = {}) => {
  const scope = normalizeBranchIds({ branchId, branchIds });
  const branchFilter = buildBranchSqlFilter("branch_id", scope, {
    keyword: "AND",
  });

  const [monthResult, latestRow, history] = await Promise.all([
    pool.execute(
      `SELECT COUNT(*) AS stocktakesThisMonth
       FROM (
         SELECT branch_id, verification_day
         FROM stock_verification
         WHERE YEAR(verification_day) = YEAR(CURDATE())
           AND MONTH(verification_day) = MONTH(CURDATE())
           ${branchFilter.clause}
         GROUP BY branch_id, verification_day
       ) scoped_stocktakes`,
      branchFilter.params,
    ),
    getLatestStocktakeRow({ branchIds: scope }),
    getStocktakeHistory({ branchIds: scope }),
  ]);

  const stocktakesThisMonth = Number(
    monthResult[0][0]?.stocktakesThisMonth ?? 0,
  );

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
    lastStocktakeLabel: formatRelativeStocktakeTime(
      latestRow.verification_date,
    ),
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

const getInventorySummary = async ({
  branchId = null,
  branchIds = null,
} = {}) => {
  const scope = normalizeBranchIds({ branchId, branchIds });

  if (scope.length === 0) {
    return {
      batch: null,
      totals: emptyTotals(),
      byProduct: [],
      byCounter: [],
      recentTags: [],
    };
  }

  const counterNameExpr =
    scope.length === 1
      ? `CASE
    WHEN counter_name IS NULL OR TRIM(counter_name) = '' THEN 'Unassigned'
    ELSE TRIM(counter_name)
  END`
      : `CASE
    WHEN p.counter_name IS NULL OR TRIM(p.counter_name) = '' THEN 'Unassigned'
    ELSE TRIM(p.counter_name)
  END`;

  let baseFrom;
  let queryParams;
  let batch = null;

  if (scope.length === 1) {
    const batchId = await getActiveBatchId(scope[0]);

    if (!batchId) {
      return {
        batch: null,
        totals: emptyTotals(),
        byProduct: [],
        byCounter: [],
        recentTags: [],
      };
    }

    batch = await getBatchInfo(batchId);
    baseFrom = batchAllProductsFrom;
    queryParams = [batchId];
  } else {
    const branchFilter = buildBranchSqlFilter("pub.branch_id", scope);
    baseFrom = `${activeBranchProductsJoin("pub")} WHERE ${activeBranchProductsWhere} ${branchFilter.clause}`;
    queryParams = [...branchFilter.params];
  }

  const productPrefix = scope.length === 1 ? "" : "p.";

  // For a single branch, distinct product/sub-product/counter counts are taken
  // directly. For multiple branches we intentionally do NOT dedupe shared names
  // across branches: we compute each branch's distinct counts and sum them, so
  // "All branches" reflects the combined per-branch totals.
  const totalsSql =
    scope.length === 1
      ? `SELECT
           COUNT(*) AS totalTags,
           SUM(
             CASE
               WHEN tag_packet_no IS NOT NULL AND TRIM(tag_packet_no) != '' THEN 1
               ELSE 0
             END
           ) AS taggedTags,
           SUM(
             CASE
               WHEN tag_packet_no IS NULL OR TRIM(tag_packet_no) = '' THEN 1
               ELSE 0
             END
           ) AS untaggedTags,
           COALESCE(SUM(pieces), 0) AS totalPieces,
           COALESCE(SUM(gross_wt), 0) AS totalGrossWt,
           COALESCE(SUM(net_wt), 0) AS totalNetWt,
           COUNT(DISTINCT product) AS productGroups,
           COUNT(DISTINCT CONCAT(product, '|', sub_product)) AS subProducts,
           COUNT(DISTINCT ${counterNameExpr}) AS counters
         ${baseFrom}`
      : `SELECT
           COALESCE(SUM(perBranch.totalTags), 0) AS totalTags,
           COALESCE(SUM(perBranch.taggedTags), 0) AS taggedTags,
           COALESCE(SUM(perBranch.untaggedTags), 0) AS untaggedTags,
           COALESCE(SUM(perBranch.totalPieces), 0) AS totalPieces,
           COALESCE(SUM(perBranch.totalGrossWt), 0) AS totalGrossWt,
           COALESCE(SUM(perBranch.totalNetWt), 0) AS totalNetWt,
           COALESCE(SUM(perBranch.productGroups), 0) AS productGroups,
           COALESCE(SUM(perBranch.subProducts), 0) AS subProducts,
           COALESCE(SUM(perBranch.counters), 0) AS counters
         FROM (
           SELECT
             pub.branch_id,
             COUNT(*) AS totalTags,
             SUM(
               CASE
                 WHEN p.tag_packet_no IS NOT NULL AND TRIM(p.tag_packet_no) != '' THEN 1
                 ELSE 0
               END
             ) AS taggedTags,
             SUM(
               CASE
                 WHEN p.tag_packet_no IS NULL OR TRIM(p.tag_packet_no) = '' THEN 1
                 ELSE 0
               END
             ) AS untaggedTags,
             COALESCE(SUM(p.pieces), 0) AS totalPieces,
             COALESCE(SUM(p.gross_wt), 0) AS totalGrossWt,
             COALESCE(SUM(p.net_wt), 0) AS totalNetWt,
             COUNT(DISTINCT p.product) AS productGroups,
             COUNT(DISTINCT CONCAT(p.product, '|', p.sub_product)) AS subProducts,
             COUNT(DISTINCT ${counterNameExpr}) AS counters
           ${baseFrom}
           GROUP BY pub.branch_id
         ) perBranch`;

  const [[totalsRows], [byProductRows], [byCounterRows], [recentRows]] =
    await Promise.all([
      pool.execute(totalsSql, queryParams),
      pool.execute(
        `SELECT
           ${productPrefix}product AS name,
           COUNT(DISTINCT ${productPrefix}sub_product) AS subProductCount,
           COUNT(*) AS tagCount,
           COALESCE(SUM(${productPrefix}pieces), 0) AS pieceCount
         ${scope.length === 1 ? baseFrom : baseFrom}
         GROUP BY ${productPrefix}product
         ORDER BY pieceCount DESC, name ASC`,
        queryParams,
      ),
      pool.execute(
        `SELECT
           ${counterNameExpr} AS name,
           COUNT(DISTINCT CONCAT(${productPrefix}product, '|', ${productPrefix}sub_product)) AS subProductCount,
           COUNT(DISTINCT ${productPrefix}product) AS productCount,
           COUNT(*) AS tagCount
         ${scope.length === 1 ? baseFrom : baseFrom}
         GROUP BY ${counterNameExpr}
         ORDER BY subProductCount DESC, name ASC`,
        queryParams,
      ),
      pool.execute(
        `SELECT
           ${productPrefix}id,
           ${productPrefix}product,
           ${productPrefix}sub_product AS subProduct,
           ${productPrefix}counter_name AS counterName,
           ${productPrefix}tag_packet_no AS tagPacketNo
         ${scope.length === 1 ? batchAllProductsFrom : baseFrom}
         ORDER BY ${productPrefix}id DESC
         LIMIT 10`,
        queryParams,
      ),
    ]);

  const totalsRow = totalsRows[0];

  return {
    batch,
    totals: {
      totalTags: Number(totalsRow.totalTags ?? 0),
      taggedTags: Number(totalsRow.taggedTags ?? 0),
      untaggedTags: Number(totalsRow.untaggedTags ?? 0),
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

const getVerificationSummary = async ({
  branchId = null,
  branchIds = null,
} = {}) => {
  const scope = normalizeBranchIds({ branchId, branchIds });

  const [stocktake, counterAccuracy] = await Promise.all([
    getStocktakeSummary({ branchIds: scope }),
    getCounterAccuracy({ branchIds: scope }),
  ]);

  const foundCount = Number(stocktake.foundCount ?? 0);
  const missingCount = Number(stocktake.missingCount ?? 0);
  const newCount = Number(stocktake.newCount ?? 0);

  return {
    totalFound: foundCount,
    totalMissing: missingCount,
    totalNew: newCount,
    totalTags: foundCount + missingCount + newCount,
    stocktake,
    counterAccuracy,
  };
};

const getDashboard = async ({ branchId = null, branchIds = null } = {}) => {
  const [inventory, verification] = await Promise.all([
    getInventorySummary({ branchId, branchIds }),
    getVerificationSummary({ branchId, branchIds }),
  ]);

  return {
    inventory,
    verification,
  };
};

const getLatestTwoBatchIds = async ({ branchIds = null } = {}) => {
  const scope = normalizeBranchIds({ branchIds });
  const branchFilter = buildBranchSqlFilter("branch_id", scope, {
    keyword: "WHERE",
  });

  const [rows] = await pool.execute(
    `SELECT id, batch_date, uploaded_at
     FROM product_upload_batches
     ${branchFilter.clause}
     ORDER BY id DESC
     LIMIT 2`,
    branchFilter.params,
  );

  return rows;
};

const TOP_SOLD_PERIOD_LIMITS = {
  week: 7,
  month: 30,
};

const getTopSoldProducts = async ({
  period = "all",
  branchId = null,
  branchIds = null,
} = {}) => {
  const scope = normalizeBranchIds({ branchId, branchIds });
  const normalizedPeriod = String(period ?? "all")
    .trim()
    .toLowerCase();
  const intervalDays = TOP_SOLD_PERIOD_LIMITS[normalizedPeriod];

  if (normalizedPeriod !== "all" && !intervalDays) {
    throw new ApiError(400, 'period must be "all", "week", or "month"');
  }

  const emptyResponse = {
    period: normalizedPeriod,
    latestBatch: null,
    previousBatch: null,
    products: [],
  };

  if (scope.length === 0) {
    return emptyResponse;
  }

  const branchFilter = buildBranchSqlFilter("b.branch_id", scope);
  const conditions = ["isa.product IS NOT NULL", "TRIM(isa.product) != ''"];
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
     LEFT JOIN product_upload_batches prev ON prev.id = isa.previous_batch_id
     WHERE ${conditions.join(" AND ")} ${branchFilter.clause}
       AND (
         isa.previous_batch_id IS NULL
         OR prev.branch_id = b.branch_id
       )
     GROUP BY isa.product
     HAVING soldCount > 0 OR soldTags > 0
     ORDER BY soldCount DESC, soldTags DESC, isa.product ASC
     LIMIT 10`,
    [...params, ...branchFilter.params],
  );

  const batches =
    scope.length === 1 ? await getLatestTwoBatchIds({ branchIds: scope }) : [];
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

const SAME_BRANCH_SALES_AUDIT_FILTER = `
  (isa.previous_batch_id IS NULL OR prev.branch_id = pub.branch_id)
`;

const getDayWiseSales = async ({
  period = "week",
  counter = "all",
  branchId = null,
  branchIds = null,
} = {}) => {
  const scope = normalizeBranchIds({ branchId, branchIds });
  const validatedPeriod = dailySalesSummaryService.validatePeriod(period);

  if (!validatedPeriod) {
    throw new ApiError(400, 'period must be "week" or "month"');
  }

  const counterName = dailySalesSummaryService.resolveCounterFilter(counter);
  const intervalDays = validatedPeriod === "month" ? 30 : 7;
  const resolvedCounter =
    counterName === dailySalesSummaryService.ALL_COUNTER ? "all" : counterName;

  if (scope.length === 0) {
    return {
      period: validatedPeriod,
      counter: resolvedCounter,
      totalSoldPieces: 0,
      data: [],
    };
  }

  const branchFilter = buildBranchSqlFilter("pub.branch_id", scope);
  const counterCondition =
    counterName === dailySalesSummaryService.ALL_COUNTER
      ? ""
      : "AND isa.counter_name = ?";
  const queryParams = [intervalDays];

  if (counterName !== dailySalesSummaryService.ALL_COUNTER) {
    queryParams.push(counterName);
  }

  queryParams.push(...branchFilter.params);

  const [rows] = await pool.execute(
    `SELECT
       pub.batch_date,
       COALESCE(SUM(isa.sold_pieces), 0) AS sold_pieces,
       COALESCE(SUM(isa.sold_tags), 0) AS sold_tags
     FROM inventory_sales_audit isa
     INNER JOIN product_upload_batches pub ON pub.id = isa.batch_id
     LEFT JOIN product_upload_batches prev ON prev.id = isa.previous_batch_id
     WHERE pub.batch_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       AND ${SAME_BRANCH_SALES_AUDIT_FILTER}
       ${counterCondition}
       ${branchFilter.clause}
     GROUP BY pub.batch_date
     ORDER BY pub.batch_date ASC`,
    queryParams,
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
    counter: resolvedCounter,
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
  branchIds = [],
}) => {
  const conditions = ["dss.counter_name = ?"];
  const params = [counterName];
  const branchFilter = buildBranchSqlFilter("pub.branch_id", branchIds);

  if (branchFilter.clause) {
    conditions.push(branchFilter.clause.replace(/^AND\s+/, ""));
    params.push(...branchFilter.params);
  }

  if (fromDate) {
    conditions.push("dss.batch_date >= ?");
    params.push(fromDate);
  }

  if (toDate) {
    conditions.push("dss.batch_date <= ?");
    params.push(toDate);
  }

  if (batchFrom) {
    conditions.push("dss.batch_id >= ?");
    params.push(batchFrom);
  }

  if (batchTo) {
    conditions.push("dss.batch_id <= ?");
    params.push(batchTo);
  }

  return {
    sql: `SELECT
            dss.batch_id,
            dss.batch_date,
            dss.total_stock,
            dss.total_stock_pieces,
            dss.sold_tags,
            dss.sold_pieces,
            dss.estimated_sold
          FROM daily_sales_summary dss
          INNER JOIN product_upload_batches pub ON pub.id = dss.batch_id
          WHERE ${conditions.join(" AND ")}
          ORDER BY dss.batch_id DESC
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
  branchId = null,
  branchIds = null,
} = {}) => {
  const scope = normalizeBranchIds({ branchId, branchIds });
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

  if (scope.length === 0) {
    return {
      period: validatedPeriod,
      counter: counterName,
      data: [],
    };
  }

  const limit = DAILY_IMPORT_PERIOD_LIMITS[validatedPeriod];
  const { sql, params } = buildDailyImportQuery({
    counterName,
    limit,
    fromDate,
    toDate,
    batchFrom,
    batchTo,
    branchIds: scope,
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

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const buildBatchPreviousJoin = (pairs) => {
  if (pairs.length === 0) {
    return { joinSql: "", params: [] };
  }

  const unionSql = pairs
    .map(() => "SELECT ? AS batch_id, ? AS prev_batch_id")
    .join(" UNION ALL ");

  return {
    joinSql: `INNER JOIN (${unionSql}) bm ON bm.batch_id = curr.batch_id`,
    params: pairs.flatMap((pair) => [pair.batchId, pair.prevBatchId]),
  };
};

const getStockMovement = async ({
  branchId = null,
  branchIds = null,
  slowDays = 60,
  fastDays = 30,
  limit = 10,
} = {}) => {
  const scope = normalizeBranchIds({ branchId, branchIds });
  const thresholdDays = parsePositiveInt(slowDays, 60);
  const periodDays = parsePositiveInt(fastDays, 30);
  const resultLimit = Math.min(parsePositiveInt(limit, 10), 50);

  const emptyResponse = {
    slowMovers: {
      thresholdDays,
      items: [],
    },
    fastMovers: {
      periodDays,
      items: [],
    },
  };

  if (scope.length === 0) {
    return emptyResponse;
  }

  const activeBatchIds = await getActiveBatchIdsForBranches(scope);

  if (activeBatchIds.length === 0) {
    return emptyResponse;
  }

  const batchPlaceholders = activeBatchIds.map(() => "?").join(", ");

  const [slowRows] = await pool.execute(
    `SELECT
       product AS productName,
       COALESCE(SUM(COALESCE(pieces, 0)), 0) AS pieceCount,
       ROUND(AVG(DATEDIFF(CURDATE(), tran_date))) AS avgDaysSinceMovement
     FROM products
     WHERE batch_id IN (${batchPlaceholders})
       AND tran_date IS NOT NULL
       AND product IS NOT NULL
       AND TRIM(product) != ''
     GROUP BY product
     HAVING avgDaysSinceMovement >= ?
     ORDER BY pieceCount DESC, avgDaysSinceMovement DESC, product ASC
     LIMIT ${resultLimit}`,
    [...activeBatchIds, thresholdDays],
  );

  const recentBatchIds = await getRecentBatchIdsForBranches(scope, periodDays);
  const previousBatchMap = await getPreviousBatchIdMapForBranches(scope);
  const batchPairs = recentBatchIds
    .map((batchId) => ({
      batchId,
      prevBatchId: previousBatchMap.get(batchId) ?? null,
    }))
    .filter((pair) => pair.prevBatchId);

  let newTagRows = [];
  let pieceIncreaseRows = [];

  if (batchPairs.length > 0) {
    const { joinSql, params: joinParams } = buildBatchPreviousJoin(batchPairs);
    const taggedProductFilter = `
      AND curr.tag_packet_no IS NOT NULL
      AND TRIM(curr.tag_packet_no) != ''
      AND curr.product IS NOT NULL
      AND TRIM(curr.product) != ''
    `;

    const [newRows, pieceRows] = await Promise.all([
      pool.execute(
        `SELECT
           curr.product AS productName,
           COUNT(*) AS restockedTags,
           COALESCE(SUM(COALESCE(curr.pieces, 0)), 0) AS restockedPieces
         FROM products curr
         ${joinSql}
         LEFT JOIN products prev
           ON prev.batch_id = bm.prev_batch_id
          AND prev.tag_packet_no = curr.tag_packet_no
          AND prev.tag_packet_no IS NOT NULL
          AND TRIM(prev.tag_packet_no) != ''
         WHERE prev.id IS NULL
           ${taggedProductFilter}
         GROUP BY curr.product`,
        joinParams,
      ),
      pool.execute(
        `SELECT
           curr.product AS productName,
           COUNT(*) AS restockedTags,
           COALESCE(
             SUM(COALESCE(curr.pieces, 0) - COALESCE(prev.pieces, 0)),
             0
           ) AS restockedPieces
         FROM products curr
         ${joinSql}
         INNER JOIN products prev
           ON prev.batch_id = bm.prev_batch_id
          AND prev.tag_packet_no = curr.tag_packet_no
          AND prev.tag_packet_no IS NOT NULL
          AND TRIM(prev.tag_packet_no) != ''
         WHERE COALESCE(curr.pieces, 0) > COALESCE(prev.pieces, 0)
           ${taggedProductFilter}
         GROUP BY curr.product`,
        joinParams,
      ),
    ]);

    newTagRows = newRows[0];
    pieceIncreaseRows = pieceRows[0];
  }

  const restockByProduct = new Map();

  for (const row of [...newTagRows, ...pieceIncreaseRows]) {
    const productName = row.productName;
    const existing = restockByProduct.get(productName) ?? {
      productName,
      restockedTags: 0,
      restockedPieces: 0,
    };

    existing.restockedTags += Number(row.restockedTags ?? 0);
    existing.restockedPieces += Number(row.restockedPieces ?? 0);
    restockByProduct.set(productName, existing);
  }

  const fastMoverItems = [...restockByProduct.values()]
    .filter((item) => item.restockedPieces > 0 || item.restockedTags > 0)
    .sort(
      (left, right) =>
        right.restockedPieces - left.restockedPieces ||
        right.restockedTags - left.restockedTags ||
        left.productName.localeCompare(right.productName),
    )
    .slice(0, resultLimit);

  return {
    slowMovers: {
      thresholdDays,
      items: slowRows.map((row) => ({
        productName: row.productName,
        pieceCount: Number(row.pieceCount ?? 0),
        avgDaysSinceMovement: Number(row.avgDaysSinceMovement ?? 0),
      })),
    },
    fastMovers: {
      periodDays,
      items: fastMoverItems,
    },
  };
};

const emptyBranchStocktake = () => ({
  verificationDay: null,
  lastStocktakeAt: null,
  lastStocktakeLabel: null,
  itemsScanned: 0,
  totalExpected: 0,
  foundCount: 0,
  missingCount: 0,
  newCount: 0,
  accuracyPercent: 0,
  discrepancies: 0,
});

const getActiveBatchTaggedCount = async (branchId) => {
  const batchId = await getActiveBatchId(branchId);

  if (!batchId) {
    return 0;
  }

  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM products
     WHERE batch_id = ?
       AND ${PRODUCT_TAG_FILTER.replace(/\n\s*/g, " ")}`,
    [batchId],
  );

  return Number(rows[0]?.total ?? 0);
};

const buildBranchStocktakeEntry = async (branch) => {
  const inventoryItemCount = await getActiveBatchTaggedCount(branch.id);
  const latestRow = await getLatestStocktakeRow({ branchIds: [branch.id] });

  if (!latestRow) {
    return {
      id: branch.id,
      name: branch.name,
      ...emptyBranchStocktake(),
      totalExpected: inventoryItemCount,
      itemCount: inventoryItemCount,
    };
  }

  const totalExpected =
    Number(latestRow.total_expected ?? 0) || inventoryItemCount;
  const itemsScanned = Number(latestRow.total_scanned ?? 0);
  const foundCount = Number(latestRow.found_count ?? 0);
  const missingCount = Number(latestRow.missing_count ?? 0);
  const newCount = Number(latestRow.new_count ?? 0);
  const accuracyPercent =
    totalExpected > 0
      ? Number(((foundCount / totalExpected) * 100).toFixed(2))
      : 0;

  return {
    id: branch.id,
    name: branch.name,
    verificationDay: toDateKey(latestRow.verification_day),
    lastStocktakeAt: formatDateTime(latestRow.verification_date),
    lastStocktakeLabel: formatRelativeStocktakeTime(
      latestRow.verification_date,
    ),
    itemsScanned,
    totalExpected,
    foundCount,
    missingCount,
    newCount,
    accuracyPercent,
    discrepancies: missingCount + newCount,
    itemCount: totalExpected,
  };
};

const getBranchComparison = async ({ branchIds = null } = {}) => {
  const scope = normalizeBranchIds({ branchIds });

  const emptyResponse = {
    mode: "multi",
    branches: [],
    erpVsPhysical: {
      erp: 0,
      physical: 0,
      matched: 0,
      difference: 0,
      missing: 0,
      new: 0,
    },
  };

  if (scope.length === 0) {
    return emptyResponse;
  }

  const branches = await branchService.getBranchesByIds(scope);
  const sortedBranches = [...branches].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const branchEntries = await Promise.all(
    sortedBranches.map((branch) => buildBranchStocktakeEntry(branch)),
  );

  const totals = branchEntries.reduce(
    (acc, entry) => ({
      erp: acc.erp + Number(entry.totalExpected ?? 0),
      physical: acc.physical + Number(entry.itemsScanned ?? 0),
      matched: acc.matched + Number(entry.foundCount ?? 0),
      missing: acc.missing + Number(entry.missingCount ?? 0),
      new: acc.new + Number(entry.newCount ?? 0),
    }),
    { erp: 0, physical: 0, matched: 0, missing: 0, new: 0 },
  );

  return {
    mode: "multi",
    branches: branchEntries,
    erpVsPhysical: {
      ...totals,
      difference: totals.erp - totals.physical,
    },
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
  getStockMovement,
  getBranchComparison,
};
