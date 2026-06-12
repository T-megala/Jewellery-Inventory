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

export async function fetchTopSoldProducts({ period = 'all' } = {}) {
  const query = buildQueryString({ period });
  const data = await apiFetch(`/dashboard/top-sold-products?${query}`);

  return (data || []).map((row) => ({
    itemDescription: row.itemDescription ?? row.productName ?? row.name ?? '',
    soldBarcodes: Number(row.soldBarcodes ?? row.soldTags ?? 0),
    soldQty: Number(row.soldQty ?? row.soldCount ?? 0),
  }));
}

export async function fetchDayWiseSales({ period = 'week' } = {}) {
  const query = buildQueryString({ period });
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
    totalSoldQty: Number(json.totalSoldQty ?? json.totalSoldPieces ?? 0),
    data: (json.data || []).map((row) => ({
      date: row.date,
      day: row.day,
      soldQty: Number(row.soldQty ?? row.soldPieces ?? 0),
      soldBarcodes: Number(row.soldBarcodes ?? 0),
    })),
  };
}

export async function fetchDailyImports({ period = 'week' } = {}) {
  const query = buildQueryString({ period });
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
    data: (json.data || []).map((row) => ({
      batchId: Number(row.batchId ?? 0),
      date: row.date,
      day: row.day,
      totalBarcodes: Number(row.totalBarcodes ?? row.totalStock ?? 0),
      totalQty: Number(row.totalQty ?? row.totalStockPieces ?? 0),
      soldQty: Number(row.soldQty ?? row.estimatedSold ?? 0),
      soldBarcodes: Number(row.soldBarcodes ?? 0),
    })),
  };
}
