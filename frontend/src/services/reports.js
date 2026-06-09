import { apiFetchReport, buildQueryString } from './api.js';

export function fetchStockVerificationReport(filters = {}) {
  const query = buildQueryString({
    page: String(filters.page ?? 1),
    limit: String(filters.limit ?? 20),
    productName: filters.productName,
    subProductName: filters.subProductName,
    centerName: filters.centerName,
    status: filters.status,
  });

  return apiFetchReport(`/stock-verification/report?${query}`);
}

export function fetchAllStockVerificationReport(filters = {}) {
  return fetchStockVerificationReport({
    ...filters,
    page: 1,
    limit: filters.limit ?? 10000,
  });
}
