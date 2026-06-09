import { apiFetch } from './api.js';
import { fetchStockVerificationReport } from './reports.js';

export function fetchInventorySummary() {
  return apiFetch('/products/summary');
}

export async function fetchVerificationSummary() {
  try {
    const result = await fetchStockVerificationReport({ page: 1, limit: 1 });
    return result.summary;
  } catch {
    return { totalFound: 0, totalMissing: 0, totalNew: 0, totalTags: 0 };
  }
}
