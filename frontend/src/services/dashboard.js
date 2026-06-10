import { apiFetch } from './api.js';

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
