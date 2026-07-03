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

function normalizeExecutiveCards(cards, overall = {}) {
  const byKey = Object.fromEntries(
    (cards || []).map(({ key, value }) => [key, Number(value ?? 0)]),
  );

  return {
    totalStock: Number(byKey.totalStock ?? overall.totalStockQty ?? overall.totalQty ?? 0),
    tagged: Number(byKey.tagged ?? overall.taggedProductCount ?? overall.totalBarcodes ?? 0),
    pending: Number(byKey.pending ?? overall.untaggedProductCount ?? overall.notTaggedCount ?? 0),
    reject: Number(byKey.reject ?? overall.rejectCount ?? 0),
  };
}

function normalizeInwardPending(inwardPending = {}, fallback = {}) {
  const batches = inwardPending.batches ?? fallback.batches ?? [];
  const inTransit = inwardPending.inTransit ?? fallback.verification ?? {};
  const tagInventory = inwardPending.tagInventory ?? {};
  const tagged = Number(tagInventory.tagged ?? fallback.cards?.tagged ?? 0);
  const pending = Number(tagInventory.pending ?? fallback.cards?.pending ?? 0);

  return {
    batches: batches.map((batch) => ({
      ...batch,
      totalQty: Number(batch.totalStockQty ?? batch.totalQty ?? 0),
    })),
    inTransit: {
      found: Number(inTransit.found ?? inTransit.totalFound ?? 0),
      missing: Number(inTransit.missing ?? inTransit.totalMissing ?? 0),
      new: Number(inTransit.new ?? inTransit.totalNew ?? 0),
    },
    tagInventory: {
      tagged,
      pending,
      tagCoveragePct: Number(
        tagInventory.tagCoveragePct ?? (tagged > 0 ? (tagged / (tagged + pending)) * 100 : 0),
      ),
    },
  };
}

export async function fetchExecutiveDashboard({ type = 'warehouse' } = {}) {
  const query = buildQueryString({ type });
  const data = await apiFetch(`/dashboard/executive?${query}`);
  const overall = data.overall ?? {};
  const cards = normalizeExecutiveCards(data.cards, overall);
  const inwardPending = normalizeInwardPending(data.inwardPending, {
    batches: data.batches,
    verification: data.verification,
    cards,
  });

  return {
    type: data.type ?? type,
    status: data.status ?? 'active',
    label: data.label ?? type,
    cards,
    overall: {
      ...overall,
      totalQty: cards.totalStock,
      totalBarcodes: cards.tagged,
      notTaggedCount: cards.pending,
    },
    segments: data.segments ?? [],
    inwardPending,
    topSoldProducts: (data.topSoldProducts ?? []).map((row) => ({
      itemDescription: row.itemDescription ?? row.productName ?? row.name ?? '',
      soldBarcodes: Number(row.soldBarcodes ?? row.soldTags ?? 0),
      soldQty: Number(row.soldQty ?? row.soldCount ?? 0),
    })),
    outwardDaily: (data.outwardDaily ?? data.dayWiseSales ?? []).map((row) => ({
      date: row.date,
      day: row.day,
      soldQty: Number(row.soldQty ?? row.soldPieces ?? 0),
    })),
    totalSoldQtyWeek: Number(data.totalSoldQtyWeek ?? 0),
  };
}
