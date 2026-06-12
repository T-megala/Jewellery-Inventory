import { apiFetch, buildQueryString } from './api.js';
import { fetchProductList } from './stock.js';

const PRODUCT_LIST_PAGE_SIZE = 100;

function sortNamedOptions(items) {
  return [...items].sort((left, right) => left.name.localeCompare(right.name));
}

export async function fetchReportFilterOptions() {
  const seenBarcodes = new Set();
  const seenDescriptions = new Set();
  const barcodes = [];
  const itemDescriptions = [];
  let page = 1;

  while (true) {
    const result = await fetchProductList({ page, limit: PRODUCT_LIST_PAGE_SIZE });
    const rows = result.rows || [];

    for (const row of rows) {
      const barcode = String(row.barcode ?? '').trim();
      const description = String(row.itemDescription ?? '').trim();

      if (barcode && !seenBarcodes.has(barcode)) {
        seenBarcodes.add(barcode);
        barcodes.push({ id: barcodes.length + 1, name: barcode });
      }

      if (description && !seenDescriptions.has(description)) {
        seenDescriptions.add(description);
        itemDescriptions.push({ id: itemDescriptions.length + 1, name: description });
      }
    }

    const totalPages = result.pagination?.totalPages ?? 0;
    if (!totalPages || page >= totalPages) {
      break;
    }

    page += 1;
  }

  return {
    barcodes: sortNamedOptions(barcodes),
    itemDescriptions: sortNamedOptions(itemDescriptions),
  };
}

export function fetchProducts() {
  return apiFetch('/dropdown/products');
}

export function fetchSubProducts(productName) {
  const query = buildQueryString({ productName });
  return apiFetch(`/dropdown/sub-products?${query}`);
}

export function fetchCenters(productName, subProductName) {
  const query = buildQueryString({ productName, subProductName });
  return apiFetch(`/dropdown/centers?${query}`);
}
