import { apiFetchReport } from './api.js';

export function fetchStockVerificationReport(filters = {}) {
  return apiFetchReport('/stock-verification/report', {
    page: filters.page ?? 1,
    limit: filters.limit ?? 20,
    productName: filters.productName,
    subProductName: filters.subProductName,
    centerName: filters.centerName,
    status: filters.status,
  });
}

export function fetchAllStockVerificationReport(filters = {}) {
  return fetchStockVerificationReport({
    ...filters,
    page: 1,
    limit: filters.limit ?? 10000,
  });
}
