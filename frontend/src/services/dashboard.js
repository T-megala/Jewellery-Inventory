import { apiFetch, apiUrl, buildQueryString, getAuthHeaders } from './api.js';

const EMPTY_VERIFICATION = {
  totalFound: 0,
  totalMissing: 0,
  totalNew: 0,
  totalTags: 0,
};

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

  return {
    inventory: data.inventory ?? null,
    verification: data.verification ?? { ...EMPTY_VERIFICATION },
  };
}

export async function fetchTopSoldProducts() {
  const data = await apiFetch('/dashboard/top-sold-products');
  return (data || []).map((row) => ({
    productName: row.productName ?? row.name ?? '',
    yesterdayCount: Number(row.yesterdayCount ?? 0),
    todayCount: Number(row.todayCount ?? 0),
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
