import { apiFetch, apiUrl, authFetch, buildQueryString, getAuthHeaders, withBranchParams } from './api.js';
import { createUserError } from '../utils/userErrorMessage.js';

const EMPTY_VERIFICATION = {
  totalFound: 0,
  totalMissing: 0,
  totalNew: 0,
  totalTags: 0,
};

const EMPTY_STOCKTAKE_HISTORY = {
  sessions: [],
  sessionCount: 0,
  averageAccuracyPercent: 0,
  averageDurationMinutes: 0,
  frequencyLabel: null,
  averageFrequencyDays: null,
};

export const EMPTY_STOCKTAKE = {
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
  history: { ...EMPTY_STOCKTAKE_HISTORY },
};

export const EMPTY_COUNTER_ACCURACY = {
  verificationDay: null,
  locations: [],
};

function normalizeStocktakeHistory(history = {}) {
  return {
    sessions: (history.sessions || []).map((session) => ({
      verificationId: session.verificationId ?? null,
      date: session.date ?? '',
      label: session.label ?? '',
      accuracyPercent: Number(session.accuracyPercent ?? 0),
      itemsScanned: Number(session.itemsScanned ?? 0),
      totalExpected: Number(session.totalExpected ?? 0),
      foundCount: Number(session.foundCount ?? 0),
      discrepancies: Number(session.discrepancies ?? 0),
      durationMinutes: Number(session.durationMinutes ?? 0),
      completedAt: session.completedAt ?? null,
    })),
    sessionCount: Number(history.sessionCount ?? 0),
    averageAccuracyPercent: Number(history.averageAccuracyPercent ?? 0),
    averageDurationMinutes: Number(history.averageDurationMinutes ?? 0),
    frequencyLabel: history.frequencyLabel ?? null,
    averageFrequencyDays: history.averageFrequencyDays ?? null,
  };
}

function normalizeCounterAccuracy(counterAccuracy = {}) {
  return {
    verificationDay: counterAccuracy.verificationDay ?? null,
    locations: (counterAccuracy.locations || []).map((row) => ({
      name: row.name ?? '',
      label: row.label ?? row.name ?? '',
      category: row.category ?? null,
      expected: Number(row.expected ?? 0),
      found: Number(row.found ?? 0),
      missing: Number(row.missing ?? 0),
      accuracyPercent: Number(row.accuracyPercent ?? 0),
    })),
  };
}

function normalizeStocktake(stocktake = {}) {
  return {
    ...EMPTY_STOCKTAKE,
    itemsScanned: Number(stocktake.itemsScanned ?? 0),
    scanRatePercent: Number(stocktake.scanRatePercent ?? 0),
    discrepancies: Number(stocktake.discrepancies ?? 0),
    stocktakesThisMonth: Number(stocktake.stocktakesThisMonth ?? 0),
    lastStocktakeAt: stocktake.lastStocktakeAt ?? null,
    lastStocktakeLabel: stocktake.lastStocktakeLabel ?? null,
    totalExpected: Number(stocktake.totalExpected ?? 0),
    foundCount: Number(stocktake.foundCount ?? 0),
    missingCount: Number(stocktake.missingCount ?? 0),
    newCount: Number(stocktake.newCount ?? 0),
    verificationDay: stocktake.verificationDay ?? null,
    scope: stocktake.scope ?? null,
    history: normalizeStocktakeHistory(stocktake.history),
  };
}

export function fetchInventorySummary() {
  return apiFetch('/products/summary');
}

export async function fetchVerificationSummary() {
  try {
    return await apiFetch('/dashboard/verification-summary');
  } catch {
    return { ...EMPTY_VERIFICATION };
  }
}

export async function fetchDashboard() {
  const data = await apiFetch('/dashboard', {
    fallbackMessage: 'Unable to load dashboard. Please try again.',
  });
  const verification = data.verification ?? { ...EMPTY_VERIFICATION };

  return {
    inventory: data.inventory ?? null,
    verification: {
      ...EMPTY_VERIFICATION,
      ...verification,
      stocktake: normalizeStocktake(verification.stocktake),
      counterAccuracy: normalizeCounterAccuracy(verification.counterAccuracy),
    },
  };
}

export async function fetchTopSoldProducts({ period = 'all' } = {}) {
  const query = buildQueryString(withBranchParams({ period }));
  const data = await apiFetch(`/dashboard/top-sold-products?${query}`);

  return (data || []).map((row) => ({
    productName: row.productName ?? row.name ?? '',
    soldTags: Number(row.soldTags ?? 0),
    soldCount: Number(row.soldCount ?? 0),
  }));
}

export async function fetchDayWiseSales({ period = 'week', counter = 'all' } = {}) {
  const query = buildQueryString(withBranchParams({ period, counter }));
  const res = await authFetch(apiUrl(`/dashboard/day-wise-sales?${query}`), {
    method: 'GET',
    scopeBranch: true,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders({ scopeBranch: true }),
    },
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw createUserError(null, 'Unable to load day-wise sales. Please try again.');
  }

  if (!res.ok || json?.success === false) {
    throw createUserError(json?.message, 'Unable to load day-wise sales. Please try again.');
  }

  return {
    period: json.period ?? period,
    counter: json.counter ?? counter,
    branchId: json.branchId ?? null,
    branchIds: Array.isArray(json.branchIds) ? json.branchIds : [],
    totalSoldPieces: Number(json.totalSoldPieces ?? 0),
    data: (json.data || []).map((row) => ({
      date: row.date,
      day: row.day,
      soldPieces: Number(row.soldPieces ?? 0),
    })),
  };
}

export async function fetchDailyImports({ period = 'week', counter = 'ALL' } = {}) {
  const query = buildQueryString(withBranchParams({ period, counter }));
  const res = await authFetch(apiUrl(`/dashboard/daily-imports?${query}`), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw createUserError(null, 'Unable to load daily imports. Please try again.');
  }

  if (!res.ok || json?.success === false) {
    throw createUserError(json?.message, 'Unable to load daily imports. Please try again.');
  }

  return {
    period: json.period ?? period,
    counter: json.counter ?? counter,
    data: (json.data || []).map((row) => ({
      batchId: Number(row.batchId ?? 0),
      date: row.date,
      day: row.day,
      totalStock: Number(row.totalStock ?? 0),
      estimatedSold: Number(row.estimatedSold ?? 0),
    })),
  };
}

export async function fetchBranchComparison() {
  const data = await apiFetch('/dashboard/branch-comparison', { scopeBranch: false }) ?? {};
  return {
    mode: data.mode ?? 'multi',
    branches: (data.branches || []).map((row) => ({
      id: row.id ?? null,
      name: row.name ?? '',
      itemCount: Number(row.itemCount ?? row.totalExpected ?? 0),
      totalExpected: Number(row.totalExpected ?? row.itemCount ?? 0),
      itemsScanned: Number(row.itemsScanned ?? 0),
      foundCount: Number(row.foundCount ?? 0),
      missingCount: Number(row.missingCount ?? 0),
      newCount: Number(row.newCount ?? 0),
      accuracyPercent: Number(row.accuracyPercent ?? 0),
    })),
    erpVsPhysical: {
      erp: Number(data.erpVsPhysical?.erp ?? 0),
      physical: Number(data.erpVsPhysical?.physical ?? 0),
      matched: Number(data.erpVsPhysical?.matched ?? 0),
      difference: Number(data.erpVsPhysical?.difference ?? 0),
      missing: Number(data.erpVsPhysical?.missing ?? 0),
      new: Number(data.erpVsPhysical?.new ?? 0),
    },
  };
}

export async function fetchSmartAlerts({ consecutiveStocktakes, accuracyDropThreshold, limit } = {}) {
  const params = {};
  if (consecutiveStocktakes != null) params.consecutiveStocktakes = consecutiveStocktakes;
  if (accuracyDropThreshold != null) params.accuracyDropThreshold = accuracyDropThreshold;
  if (limit != null) params.limit = limit;

  const query = buildQueryString(withBranchParams(params));
  const path = query ? `/dashboard/smart-alerts?${query}` : '/dashboard/smart-alerts';
  const data = await apiFetch(path) ?? {};

  return {
    generatedAt: data.generatedAt ?? null,
    sessionCount: Number(data.sessionCount ?? 0),
    consecutiveStocktakes: Number(data.consecutiveStocktakes ?? 2),
    accuracyDropThreshold: Number(data.accuracyDropThreshold ?? 2),
    alerts: (data.alerts || []).map((alert) => ({
      id: alert.id ?? '',
      severity: alert.severity ?? 'info',
      icon: alert.icon ?? alert.severity ?? 'info',
      title: alert.title ?? '',
      message: alert.message ?? '',
      count: Number(alert.count ?? 0),
      breakdown: (alert.breakdown || []).map((row) => ({
        category: row.category ?? '',
        count: Number(row.count ?? 0),
      })),
      meta: alert.meta ?? {},
    })),
  };
}

export async function fetchStockMovement({ slowDays = 60, fastDays = 30, limit = 3 } = {}) {
  const query = buildQueryString(withBranchParams({ slowDays, fastDays, limit }));
  const res = await authFetch(apiUrl(`/dashboard/stock-movement?${query}`), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw createUserError(null, 'Unable to load stock movement. Please try again.');
  }

  if (!res.ok || json?.success === false) {
    throw createUserError(json?.message, 'Unable to load stock movement. Please try again.');
  }

  const data = json.data ?? json ?? {};

  return {
    slowMovers: {
      thresholdDays: Number(data.slowMovers?.thresholdDays ?? slowDays),
      items: (data.slowMovers?.items || []).map((row) => ({
        productName: row.productName ?? row.name ?? '',
        pieceCount: Number(row.pieceCount ?? row.pieces ?? 0),
        avgDaysSinceMovement: Number(row.avgDaysSinceMovement ?? row.days ?? 0),
      })),
    },
    fastMovers: {
      periodDays: Number(data.fastMovers?.periodDays ?? fastDays),
      items: (data.fastMovers?.items || []).map((row) => ({
        productName: row.productName ?? row.name ?? '',
        restockedPieces: Number(row.restockedPieces ?? row.restocked ?? 0),
        restockedTags: Number(row.restockedTags ?? 0),
      })),
    },
  };
}
