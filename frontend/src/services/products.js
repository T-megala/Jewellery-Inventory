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

function mergeByName(items) {
  const byName = new Map();
  (items || []).flat().forEach((item) => {
    if (item?.name) byName.set(item.name, item);
  });
  return [...byName.values()];
}

export async function fetchSubProductsForProducts(productNames = []) {
  const names = productNames.map((name) => String(name).trim()).filter(Boolean);
  if (!names.length) return [];
  const batches = await Promise.all(names.map((name) => fetchSubProducts(name)));
  return mergeByName(batches);
}

export async function fetchCentersForSelection(productNames = [], subProductNames = []) {
  const products = productNames.map((name) => String(name).trim()).filter(Boolean);
  const subProducts = subProductNames.map((name) => String(name).trim()).filter(Boolean);
  if (!products.length || !subProducts.length) return [];

  const batches = await Promise.all(
    products.flatMap((productName) =>
      subProducts.map((subProductName) => fetchCenters(productName, subProductName)),
    ),
  );
  return mergeByName(batches);
}
