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

function normalizeRetailPayload(data = {}) {
  const byKey = Object.fromEntries(
    (data.cards || []).map(({ key, value }) => [key, Number(value ?? 0)]),
  );
  const storeStock = data.storeStock ?? data.storeWideStock ?? {};
  const movement = data.movement ?? data.retailMovement ?? {};
  const billing = data.billingShrinkage ?? data.billing ?? {};
  const hardwareSync = data.hardwareSync ?? data.retailHardware ?? {};

  const mapStoreRow = (row, index) => ({
    store: row.store ?? row.storeName ?? row.name ?? `Store ${index + 1}`,
    stock: Number(row.stock ?? row.stockUnits ?? row.units ?? 0),
    daysCover: Number(row.daysCover ?? row.days ?? 0),
    status: row.status ?? 'healthy',
    accuracyPct: Number(row.accuracyPct ?? row.accuracy ?? row.pct ?? 0),
    leadTimeHours: Number(row.leadTimeHours ?? row.hours ?? row.leadTime ?? 0),
    billsToday: Number(row.billsToday ?? row.bills ?? 0),
    avgTimeSec: Number(row.avgTimeSec ?? row.avgTime ?? 0),
    errorPct: Number(row.errorPct ?? row.errors ?? 0),
    shrinkagePcs: Number(row.shrinkagePcs ?? row.shrinkage ?? row.pcs ?? 0),
    lastSync: row.lastSync ?? row.lastSyncLabel ?? '—',
    syncStatus: row.syncStatus ?? row.status ?? 'ok',
  });

  const accuracyRows = (storeStock.accuracy ?? storeStock.accuracyByStore ?? storeStock.stores ?? [])
    .map(mapStoreRow);
  const stockRows = (storeStock.onHand ?? storeStock.stockOnHand ?? storeStock.stores ?? [])
    .map(mapStoreRow);
  const leadTimeRows = (movement.inwardLeadTime ?? movement.leadTime ?? [])
    .map(mapStoreRow);
  const billingRows = (billing.performance ?? billing.stores ?? [])
    .map(mapStoreRow);
  const shrinkageRows = (billing.shrinkageByStore ?? billing.shrinkage ?? [])
    .map(mapStoreRow);
  const storeSyncRows = (hardwareSync.storeSync ?? hardwareSync.stores ?? [])
    .map(mapStoreRow);

  return {
    summary: {
      totalStock: Number(byKey.totalStock ?? data.totalStock ?? 0),
      storeCount: Number(data.storeCount ?? storeStock.storeCount ?? byKey.storeCount ?? 0),
      soldMtd: Number(byKey.soldMtd ?? byKey.soldBillMtd ?? 0),
      soldMtdTrendPct: data.soldMtdTrendPct ?? storeStock.soldMtdTrendPct ?? null,
      shrinkageMtd: Number(byKey.shrinkageMtd ?? byKey.shrinkage ?? 0),
      shrinkageTrendPct: data.shrinkageTrendPct ?? null,
      storesNeedingRestock: Number(byKey.storesNeedingRestock ?? byKey.restockCount ?? 0),
      restockStoreLabel: data.restockStoreLabel ?? storeStock.restockStoreLabel ?? '',
      avgStockAccuracy: Number(byKey.avgStockAccuracy ?? byKey.stockAccuracy ?? 0),
      accuracyTarget: Number(data.accuracyTarget ?? storeStock.accuracyTarget ?? 97),
    },
    storeAccuracy: accuracyRows,
    stockOnHand: stockRows,
    accuracyAlert: storeStock.accuracyAlert ?? data.accuracyAlert ?? '',
    inwardDaily: (movement.inwardDaily ?? data.inwardDaily ?? []).map((row) => ({
      date: row.date,
      day: row.day,
      qty: Number(row.qty ?? row.inwardQty ?? row.soldQty ?? 0),
    })),
    inwardLeadTime: leadTimeRows,
    billingPerformance: billingRows,
    shrinkageByStore: shrinkageRows,
    shrinkageMtd: Number(billing.shrinkageMtd ?? byKey.shrinkageMtd ?? 0),
    easAlarmsToday: Number(billing.easAlarmsToday ?? billing.exitGateAlarms ?? 0),
    categorySellThrough: (billing.categorySellThrough ?? billing.categories ?? []).map((row) => ({
      name: row.name ?? row.category ?? '',
      value: Number(row.value ?? row.qty ?? row.soldQty ?? 0),
      pct: Number(row.pct ?? row.percentage ?? 0),
    })),
    hardware: (hardwareSync.hardware ?? hardwareSync.devices ?? []).map((row) => ({
      name: row.name ?? '',
      online: Number(row.online ?? 0),
      total: Number(row.total ?? 0),
    })),
    sync: {
      pendingRecords: Number(hardwareSync.sync?.pendingRecords ?? hardwareSync.pendingRecords ?? 0),
      failuresToday: Number(hardwareSync.sync?.failuresToday ?? hardwareSync.failuresToday ?? 0),
      avgLastSyncMinutes: Number(
        hardwareSync.sync?.avgLastSyncMinutes ?? hardwareSync.avgLastSyncMinutes ?? 0,
      ),
    },
    storeSync: storeSyncRows,
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
    outwardSplit: {
      totalSold: Number(data.outwardSplit?.totalSold ?? 0),
      retail: Number(data.outwardSplit?.retail ?? 0),
      franchise: Number(data.outwardSplit?.franchise ?? 0),
    },
    totalSoldQtyWeek: Number(data.totalSoldQtyWeek ?? 0),
    retail: type === 'retail' ? normalizeRetailPayload(data) : null,
    franchise: type === 'franchise' ? normalizeFranchisePayload(data) : null,
  };
}

function normalizeFranchisePayload(data = {}) {
  const byKey = Object.fromEntries(
    (data.cards || []).map(({ key, value }) => [key, Number(value ?? 0)]),
  );
  const partnerStock = data.partnerStock ?? data.partnerWiseStock ?? data.storeStock ?? {};
  const movement = data.movement ?? data.franchiseMovement ?? {};
  const billing = data.billingShrinkage ?? data.billing ?? {};
  const hardwareSync = data.hardwareSync ?? data.franchiseHardware ?? {};

  const mapPartnerRow = (row, index) => ({
    partner: row.partner ?? row.partnerName ?? row.name ?? `Franchise ${String.fromCharCode(65 + index)}`,
    stock: Number(row.stock ?? row.stockUnits ?? row.units ?? 0),
    daysCover: Number(row.daysCover ?? row.days ?? 0),
    status: row.status ?? 'healthy',
    accuracyPct: Number(row.accuracyPct ?? row.accuracy ?? row.pct ?? 0),
    billsToday: Number(row.billsToday ?? row.bills ?? 0),
    avgTimeSec: Number(row.avgTimeSec ?? row.avgTime ?? 0),
    errorPct: Number(row.errorPct ?? row.errors ?? 0),
    shrinkagePcs: Number(row.shrinkagePcs ?? row.shrinkage ?? row.pcs ?? 0),
    lastSync: row.lastSync ?? row.lastSyncLabel ?? '0 min ago',
    syncStatus: row.syncStatus ?? row.status ?? 'live',
  });

  const mapDcRow = (row) => ({
    dcId: row.dcId ?? row.id ?? '—',
    partnerLabel: row.partnerLabel ?? row.partner ?? '—',
    units: Number(row.units ?? row.qty ?? 0),
    status: row.status ?? 'in_transit',
    statusLabel: row.statusLabel ?? row.label ?? '',
    hours: Number(row.hours ?? row.leadTimeHours ?? 0),
  });

  const accuracyRows = (partnerStock.accuracy ?? partnerStock.accuracyByPartner ?? partnerStock.partners ?? [])
    .map(mapPartnerRow);
  const stockRows = (partnerStock.onHand ?? partnerStock.stockOnHand ?? partnerStock.partners ?? [])
    .map(mapPartnerRow);
  const billingRows = (billing.performance ?? billing.partners ?? [])
    .map(mapPartnerRow);
  const shrinkageRows = (billing.shrinkageByPartner ?? billing.shrinkage ?? [])
    .map(mapPartnerRow);
  const partnerSyncRows = (hardwareSync.partnerSync ?? hardwareSync.partners ?? hardwareSync.storeSync ?? [])
    .map(mapPartnerRow);

  return {
    summary: {
      totalStock: Number(byKey.totalStock ?? data.totalStock ?? 0),
      partnerCount: Number(data.partnerCount ?? partnerStock.partnerCount ?? byKey.partnerCount ?? 0),
      soldMtd: Number(byKey.soldMtd ?? byKey.soldBillMtd ?? 0),
      soldMtdTrendPct: data.soldMtdTrendPct ?? partnerStock.soldMtdTrendPct ?? null,
      shrinkageMtd: Number(byKey.shrinkageMtd ?? byKey.shrinkage ?? 0),
      shrinkageRiskPct: Number(byKey.shrinkageRiskPct ?? data.shrinkageRiskPct ?? 0),
      pendingVerification: Number(byKey.pendingVerification ?? byKey.pending ?? 0),
      pendingVerificationLabel: data.pendingVerificationLabel ?? partnerStock.pendingVerificationLabel ?? '',
      avgStockAccuracy: Number(byKey.avgStockAccuracy ?? byKey.stockAccuracy ?? 0),
      accuracyThreshold: Number(data.accuracyThreshold ?? partnerStock.accuracyThreshold ?? 95),
    },
    partnerAccuracy: accuracyRows,
    stockOnHand: stockRows,
    accuracyAlert: partnerStock.accuracyAlert ?? data.accuracyAlert ?? '',
    stockCoverAlert: partnerStock.stockCoverAlert ?? data.stockCoverAlert ?? '',
    inwardDaily: (movement.inwardDaily ?? data.inwardDaily ?? []).map((row) => ({
      date: row.date,
      day: row.day,
      qty: Number(row.qty ?? row.inwardQty ?? 0),
    })),
    inTransitDCs: (movement.inTransitDCs ?? movement.inTransit ?? []).map(mapDcRow),
    inTransitAlert: movement.inTransitAlert ?? data.inTransitAlert ?? '',
    billingPerformance: billingRows,
    billingAlert: billing.billingAlert ?? data.billingAlert ?? '',
    shrinkageByPartner: shrinkageRows,
    shrinkageMtd: Number(billing.shrinkageMtd ?? byKey.shrinkageMtd ?? 0),
    shrinkagePct: Number(billing.shrinkagePct ?? byKey.shrinkageRiskPct ?? 0),
    shrinkageComment: billing.shrinkageComment ?? data.shrinkageComment ?? '',
    categorySellThrough: (billing.categorySellThrough ?? billing.categories ?? []).map((row) => ({
      name: row.name ?? row.category ?? '',
      value: Number(row.value ?? row.qty ?? 0),
      pct: Number(row.pct ?? row.percentage ?? 0),
    })),
    hardware: (hardwareSync.hardware ?? hardwareSync.devices ?? []).map((row) => ({
      name: row.name ?? '',
      online: Number(row.online ?? 0),
      total: Number(row.total ?? 0),
    })),
    sync: {
      pendingRecords: Number(hardwareSync.sync?.pendingRecords ?? hardwareSync.pendingRecords ?? 0),
      failuresToday: Number(hardwareSync.sync?.failuresToday ?? hardwareSync.failuresToday ?? 0),
      avgLastSyncMinutes: Number(
        hardwareSync.sync?.avgLastSyncMinutes ?? hardwareSync.avgLastSyncMinutes ?? 0,
      ),
    },
    partnerSync: partnerSyncRows,
  };
}
