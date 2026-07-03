import { apiFetch, apiGet, buildQueryString } from './api.js';

const EMPTY_VERIFICATION = {
  totalFound: 0,
  totalMissing: 0,
  totalNew: 0,
  totalTags: 0,
};

const EMPTY_OVERVIEW = {
  categories: 0,
  subProducts: 0,
  totalItemsErp: 0,
  itemsScanned: 0,
  discrepancies: 0,
  stocktakesThisMonth: 0,
  scanRate: 0,
  lastStocktakeAt: null,
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
    overview: data.overview ?? { ...EMPTY_OVERVIEW },
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
  const json = await apiGet(`/dashboard/day-wise-sales?${query}`);

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
  const json = await apiGet(`/dashboard/daily-imports?${query}`);

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

export async function fetchExecutiveDashboard({ type = 'warehouse' } = {}) {
  const query = buildQueryString({ type });
  const data = await apiFetch(`/dashboard/executive?${query}`);
  const overall = data.overall ?? {};

  return {
    type: data.type ?? type,
    status: data.status ?? 'active',
    label: data.label ?? type,
    overall: {
      ...overall,
      totalQty: Number(overall.totalStockQty ?? overall.totalQty ?? 0),
      totalBarcodes: Number(overall.taggedProductCount ?? overall.totalBarcodes ?? 0),
      notTaggedCount: Number(overall.untaggedProductCount ?? overall.notTaggedCount ?? 0),
    },
    segments: data.segments ?? [],
    batches: (data.batches ?? []).map((batch) => ({
      ...batch,
      totalQty: Number(batch.totalStockQty ?? batch.totalQty ?? 0),
    })),
    topSoldProducts: (data.topSoldProducts ?? []).map((row) => ({
      itemDescription: row.itemDescription ?? row.productName ?? row.name ?? '',
      soldBarcodes: Number(row.soldBarcodes ?? row.soldTags ?? 0),
      soldQty: Number(row.soldQty ?? row.soldCount ?? 0),
    })),
    dayWiseSales: data.dayWiseSales ?? [],
    totalSoldQtyWeek: Number(data.totalSoldQtyWeek ?? 0),
    verification: data.verification ?? {
      totalFound: 0,
      totalMissing: 0,
      totalNew: 0,
      totalTags: 0,
    },
  };
}
