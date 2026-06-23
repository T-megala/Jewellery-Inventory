import { apiFetch, buildQueryString, withBranchParams } from './api.js';

export function fetchProducts() {
  return apiFetch('/dropdown/products');
}

export function fetchSubProducts(productName) {
  const query = buildQueryString(withBranchParams({ productName }));
  return apiFetch(`/dropdown/sub-products?${query}`);
}

export function fetchCenters(productName, subProductName) {
  const query = buildQueryString(withBranchParams({ productName, subProductName }));
  return apiFetch(`/dropdown/centers?${query}`);
}
