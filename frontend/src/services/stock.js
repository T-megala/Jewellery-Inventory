import { createUserError } from '../utils/userErrorMessage.js';
import { apiFetchPaged, apiFetchRaw, buildQueryString, withBranchParams } from './api.js';

export function fetchProductList({ page = 1, limit = 50, search } = {}) {
  const query = buildQueryString(withBranchParams({ page, limit, search }));
  return apiFetchPaged(`/products/list?${query}`);
}

function parseFilename(res, fallback) {
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallback;
}

export async function downloadStockExport({ search } = {}) {
  const query = buildQueryString(withBranchParams({ search }));
  const path = query ? `/products/list/export?${query}` : '/products/list/export';
  const res = await apiFetchRaw(path);

  if (!res.ok) {
    let message = 'Export failed';
    try {
      const json = await res.json();
      message = json.message || json.error || message;
    } catch {
      // binary or empty error body
    }
    throw createUserError(message, 'Export failed. Please try again.');
  }

  const blob = await res.blob();
  const filename = parseFilename(res, 'stock-list.xlsx');

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
