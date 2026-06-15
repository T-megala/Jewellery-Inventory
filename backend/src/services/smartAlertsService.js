import pool from "../config/database.js";
import { getActiveBatchId } from "./productBatchService.js";
import { TAG_EXPR } from "../utils/verificationScope.js";
import { batchProductsFrom } from "../utils/productQueryHelper.js";

const ALL_PRODUCTS = "All Products";
const ALL_SUB_PRODUCTS = "All Sub Products";
const ALL_CENTERS = "All Centers";

const LOCATION_NAME_EXPR = `CASE
  WHEN counter_name IS NULL OR TRIM(counter_name) = '' THEN 'Unassigned'
  ELSE TRIM(counter_name)
END`;

const PRODUCT_CATEGORIES = [
  { key: "necklaces", label: "Necklaces", pattern: /NECKLACE|CHAIN|MALA/i },
  { key: "bangles", label: "Bangles", pattern: /BANGLE/i },
  { key: "earrings", label: "Earrings", pattern: /EARRING|STUD|DROP/i },
  { key: "rings", label: "Rings", pattern: /RING/i },
  { key: "pendants", label: "Pendants", pattern: /PENDANT|DOLLER|DOLLAR/i },
];

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const parseThreshold = (value, fallback) => {
  const parsed = Number.parseFloat(String(value ?? ""));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const resolveProductCategory = (productName) => {
  const label = String(productName ?? "").trim();

  for (const category of PRODUCT_CATEGORIES) {
    if (category.pattern.test(label)) {
      return category;
    }
  }

  return { key: "other", label: "Other", pattern: null };
};

const buildCategoryMatchClause = (columnExpr, category) => {
  const pattern = category.pattern.source.replace(/'/g, "''");
  return `${columnExpr} REGEXP '${pattern}'`;
};

const getRecentStorewideSessions = async (limit) => {
  const [rows] = await pool.execute(
    `SELECT
       id,
       verification_day,
       verification_date,
       total_expected,
       found_count,
       missing_count,
       new_count
     FROM stock_verification
     WHERE product_name = ?
       AND sub_product_name = ?
       AND center_name = ?
     ORDER BY verification_day DESC, verification_date DESC, id DESC
     LIMIT 100`,
    [ALL_PRODUCTS, ALL_SUB_PRODUCTS, ALL_CENTERS],
  );

  const sessionsByDay = new Map();

  for (const row of rows) {
    const dayKey =
      row.verification_day instanceof Date
        ? `${row.verification_day.getFullYear()}-${String(row.verification_day.getMonth() + 1).padStart(2, "0")}-${String(row.verification_day.getDate()).padStart(2, "0")}`
        : String(row.verification_day).slice(0, 10);

    if (!sessionsByDay.has(dayKey)) {
      sessionsByDay.set(dayKey, row);
    }
  }

  return [...sessionsByDay.values()].slice(0, limit);
};

const fetchMissingTagsForSession = async (batchId, verificationId) => {
  if (!batchId) {
    return [];
  }

  const [rows] = await pool.execute(
    `SELECT
       p.product AS productName,
       ${TAG_EXPR} AS tagNo,
       COALESCE(p.pieces, 1) AS pieces
     FROM products p
     WHERE p.batch_id = ?
       AND p.tag_packet_no IS NOT NULL
       AND TRIM(p.tag_packet_no) != ''
       AND NOT EXISTS (
         SELECT 1
         FROM stock_verification_details svd
         WHERE svd.verification_id = ?
           AND svd.tag_no = ${TAG_EXPR}
           AND svd.status = 'FOUND'
       )`,
    [batchId, verificationId],
  );

  return rows;
};

const intersectMissingAcrossSessions = async (
  batchId,
  sessions,
) => {
  if (sessions.length === 0) {
    return [];
  }

  const missingBySession = await Promise.all(
    sessions.map((session) =>
      fetchMissingTagsForSession(batchId, Number(session.id)),
    ),
  );

  const [firstSession, ...otherSessions] = missingBySession;

  if (!firstSession?.length) {
    return [];
  }

  let chronicTags = new Map(
    firstSession.map((row) => [
      row.tagNo,
      {
        productName: row.productName,
        pieces: Number(row.pieces ?? 1),
      },
    ]),
  );

  for (const sessionRows of otherSessions) {
    const sessionTagSet = new Set(sessionRows.map((row) => row.tagNo));
    chronicTags = new Map(
      [...chronicTags.entries()].filter(([tagNo]) => sessionTagSet.has(tagNo)),
    );
  }

  return [...chronicTags.values()];
};

const buildChronicMissingAlert = (missingItems, consecutiveStocktakes) => {
  if (missingItems.length === 0) {
    return null;
  }

  const breakdownMap = new Map();
  let totalPieces = 0;

  for (const item of missingItems) {
    const category = resolveProductCategory(item.productName);
    const pieces = Number(item.pieces ?? 1);
    totalPieces += pieces;

    const existing = breakdownMap.get(category.label) ?? {
      category: category.label,
      count: 0,
    };
    existing.count += pieces;
    breakdownMap.set(category.label, existing);
  }

  const breakdown = [...breakdownMap.values()]
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count);

  const breakdownText = breakdown
    .map((entry) => `${entry.count} ${entry.category}`)
    .join(", ");

  return {
    id: "chronic-missing",
    severity: "error",
    icon: "error",
    title: `${totalPieces} items missing`,
    message: `${breakdownText}. Absent in ${consecutiveStocktakes}+ consecutive stocktakes.`,
    count: totalPieces,
    breakdown,
    meta: {
      consecutiveStocktakes,
      tagCount: missingItems.length,
    },
  };
};

const fetchUntaggedItems = async (verificationId) => {
  const [rows] = await pool.execute(
    `SELECT
       COALESCE(NULLIF(TRIM(product_name), ''), 'Unknown') AS productName,
       COUNT(*) AS tagCount
     FROM stock_verification_details
     WHERE verification_id = ?
       AND status = 'NEW'
     GROUP BY productName
     ORDER BY tagCount DESC, productName ASC`,
    [verificationId],
  );

  return rows.map((row) => ({
    productName: row.productName,
    tagCount: Number(row.tagCount ?? 0),
  }));
};

const buildUntaggedAlert = (untaggedItems) => {
  const totalCount = untaggedItems.reduce(
    (sum, item) => sum + item.tagCount,
    0,
  );

  if (totalCount === 0) {
    return null;
  }

  return {
    id: "untagged-on-floor",
    severity: "warning",
    icon: "warning",
    title: `${totalCount} untagged items found on floor`,
    message:
      "Not in ERP. Possible new stock without RFID tag or entry.",
    count: totalCount,
    breakdown: untaggedItems.map((item) => ({
      category: item.productName,
      count: item.tagCount,
    })),
    meta: {
      tagCount: totalCount,
    },
  };
};

const fetchExpectedByLocation = async (batchId) => {
  const [rows] = await pool.execute(
    `SELECT
       ${LOCATION_NAME_EXPR} AS location,
       COUNT(DISTINCT ${TAG_EXPR}) AS expected
     ${batchProductsFrom}
     GROUP BY ${LOCATION_NAME_EXPR}`,
    [batchId],
  );

  return new Map(
    rows.map((row) => [row.location, Number(row.expected ?? 0)]),
  );
};

const fetchFoundByLocationForSession = async (verificationId) => {
  const [rows] = await pool.execute(
    `SELECT
       CASE
         WHEN center_name IS NULL OR TRIM(center_name) = '' THEN 'Unassigned'
         ELSE TRIM(center_name)
       END AS location,
       COUNT(DISTINCT tag_no) AS found
     FROM stock_verification_details
     WHERE verification_id = ?
       AND status = 'FOUND'
     GROUP BY location`,
    [verificationId],
  );

  return new Map(rows.map((row) => [row.location, Number(row.found ?? 0)]));
};

const buildSkippedLocationAlerts = (
  expectedByLocation,
  sessions,
  consecutiveStocktakes,
) => {
  if (sessions.length < consecutiveStocktakes) {
    return [];
  }

  const alerts = [];

  for (const [location, expected] of expectedByLocation.entries()) {
    if (expected <= 0) {
      continue;
    }

    const skippedInAllSessions = sessions.every((session) => {
      const foundByLocation = session.foundByLocation;
      return (foundByLocation.get(location) ?? 0) === 0;
    });

    if (!skippedInAllSessions) {
      continue;
    }

    alerts.push({
      id: `skipped-location-${location.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      severity: "time",
      icon: "time",
      title: `${location} skipped in last ${consecutiveStocktakes} stocktakes`,
      message: "Manual check recommended.",
      count: expected,
      breakdown: [{ category: location, count: expected }],
      meta: {
        location,
        expected,
        consecutiveStocktakes,
      },
    });
  }

  return alerts;
};

const fetchCategoryAccuracy = async (batchId, verificationId, category) => {
  const productClause = buildCategoryMatchClause("p.product", category);
  const detailClause = buildCategoryMatchClause("svd.product_name", category);

  const [[expectedRows], [foundRows]] = await Promise.all([
    pool.execute(
      `SELECT COUNT(DISTINCT ${TAG_EXPR}) AS expected
       FROM products p
       WHERE p.batch_id = ?
         AND p.tag_packet_no IS NOT NULL
         AND TRIM(p.tag_packet_no) != ''
         AND ${productClause}`,
      [batchId],
    ),
    pool.execute(
      `SELECT COUNT(DISTINCT svd.tag_no) AS found
       FROM stock_verification_details svd
       WHERE svd.verification_id = ?
         AND svd.status = 'FOUND'
         AND ${detailClause}`,
      [verificationId],
    ),
  ]);

  const expected = Number(expectedRows[0]?.expected ?? 0);
  const found = Number(foundRows[0]?.found ?? 0);
  const accuracyPercent =
    expected > 0 ? Number(((found / expected) * 100).toFixed(1)) : null;

  return { expected, found, accuracyPercent };
};

const buildAccuracyDropAlerts = async (
  batchId,
  latestSession,
  previousSession,
  accuracyDropThreshold,
) => {
  if (!batchId || !latestSession || !previousSession) {
    return [];
  }

  const alerts = [];

  for (const category of PRODUCT_CATEGORIES) {
    const [latestAccuracy, previousAccuracy] = await Promise.all([
      fetchCategoryAccuracy(batchId, Number(latestSession.id), category),
      fetchCategoryAccuracy(batchId, Number(previousSession.id), category),
    ]);

    if (
      latestAccuracy.accuracyPercent === null ||
      previousAccuracy.accuracyPercent === null ||
      latestAccuracy.expected === 0 ||
      previousAccuracy.expected === 0
    ) {
      continue;
    }

    const drop =
      previousAccuracy.accuracyPercent - latestAccuracy.accuracyPercent;

    if (drop < accuracyDropThreshold) {
      continue;
    }

    alerts.push({
      id: `accuracy-drop-${category.key}`,
      severity: "info",
      icon: "info",
      title: `${category.label} accuracy dropped`,
      message: `${category.label} accuracy dropped ${previousAccuracy.accuracyPercent}% → ${latestAccuracy.accuracyPercent}% between the last two stocktakes. Investigate counter display area.`,
      count: Math.round(drop * 10) / 10,
      breakdown: [
        {
          category: category.label,
          count: latestAccuracy.expected,
        },
      ],
      meta: {
        category: category.label,
        previousAccuracyPercent: previousAccuracy.accuracyPercent,
        latestAccuracyPercent: latestAccuracy.accuracyPercent,
        dropPercent: Math.round(drop * 10) / 10,
      },
    });
  }

  return alerts;
};

const getSmartAlerts = async ({
  consecutiveStocktakes = 2,
  accuracyDropThreshold = 2,
  limit = 20,
} = {}) => {
  const sessionLimit = parsePositiveInt(consecutiveStocktakes, 2);
  const dropThreshold = parseThreshold(accuracyDropThreshold, 2);
  const alertLimit = Math.min(parsePositiveInt(limit, 20), 50);

  const [batchId, sessions] = await Promise.all([
    getActiveBatchId(),
    getRecentStorewideSessions(sessionLimit),
  ]);

  const alerts = [];

  if (batchId && sessions.length >= sessionLimit) {
    const chronicMissingItems = await intersectMissingAcrossSessions(
      batchId,
      sessions,
    );
    const chronicAlert = buildChronicMissingAlert(
      chronicMissingItems,
      sessionLimit,
    );

    if (chronicAlert) {
      alerts.push(chronicAlert);
    }
  }

  const latestSession = sessions[0] ?? null;

  if (latestSession) {
    const untaggedItems = await fetchUntaggedItems(Number(latestSession.id));
    const untaggedAlert = buildUntaggedAlert(untaggedItems);

    if (untaggedAlert) {
      alerts.push(untaggedAlert);
    }
  }

  if (batchId && sessions.length >= sessionLimit) {
    const expectedByLocation = await fetchExpectedByLocation(batchId);
    const sessionsWithFound = await Promise.all(
      sessions.map(async (session) => ({
        ...session,
        foundByLocation: await fetchFoundByLocationForSession(
          Number(session.id),
        ),
      })),
    );

    alerts.push(
      ...buildSkippedLocationAlerts(
        expectedByLocation,
        sessionsWithFound,
        sessionLimit,
      ),
    );
  }

  if (batchId && sessions.length >= 2) {
    const accuracyAlerts = await buildAccuracyDropAlerts(
      batchId,
      sessions[0],
      sessions[1],
      dropThreshold,
    );
    alerts.push(...accuracyAlerts);
  }

  return {
    generatedAt: new Date().toISOString(),
    sessionCount: sessions.length,
    consecutiveStocktakes: sessionLimit,
    accuracyDropThreshold: dropThreshold,
    alerts: alerts.slice(0, alertLimit),
  };
};

export default {
  getSmartAlerts,
};
