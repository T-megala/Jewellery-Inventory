import { apiFetchPaged, buildQueryString, withBranchParams } from './api.js';

export function fetchProductList({ page = 1, limit = 50, search } = {}) {
  const query = buildQueryString(withBranchParams({ page, limit, search }));
  return apiFetchPaged(`/products/list?${query}`);
}
