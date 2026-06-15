import { apiFetch, apiUrl, buildQueryString, getAuthHeaders } from './api.js';

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
  const data = await apiFetch('/dashboard');
  const verification = data.verification ?? { ...EMPTY_VERIFICATION };

  return {
    inventory: data.inventory ?? null,
    verification: {
      ...EMPTY_VERIFICATION,
      ...verification,
      stocktake: normalizeStocktake(verification.stocktake),
    },
  };
}

export async function fetchTopSoldProducts({ period = 'all' } = {}) {
  const query = buildQueryString({ period });
  const data = await apiFetch(`/dashboard/top-sold-products?${query}`);

  return (data || []).map((row) => ({
    productName: row.productName ?? row.name ?? '',
    soldTags: Number(row.soldTags ?? 0),
    soldCount: Number(row.soldCount ?? 0),
  }));
}

export async function fetchDayWiseSales({ period = 'week', counter = 'all' } = {}) {
  const query = buildQueryString({ period, counter });
  const res = await fetch(apiUrl(`/dashboard/day-wise-sales?${query}`), {
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
    throw new Error('Unexpected server response');
  }

  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || 'Failed to load day-wise sales');
  }

  return {
    period: json.period ?? period,
    counter: json.counter ?? counter,
    totalSoldPieces: Number(json.totalSoldPieces ?? 0),
    data: (json.data || []).map((row) => ({
      date: row.date,
      day: row.day,
      soldPieces: Number(row.soldPieces ?? 0),
    })),
  };
}

export async function fetchDailyImports({ period = 'week', counter = 'ALL' } = {}) {
  const query = buildQueryString({ period, counter });
  const res = await fetch(apiUrl(`/dashboard/daily-imports?${query}`), {
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
    throw new Error('Unexpected server response');
  }

  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || 'Failed to load daily imports');
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
