import { apiFetchRaw, apiFetchReport, buildQueryString } from './api.js';

function buildReportParams(filters = {}) {
  return {
    page: filters.page ?? 1,
    limit: filters.limit ?? 10,
    search: filters.search,
    status: filters.status,
    date: filters.date,
  };
}

export function fetchStockVerificationReport(filters = {}) {
  return apiFetchReport('/stock-verification/product-summary', buildReportParams(filters));
}

function parseFilename(res, fallback) {
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallback;
}

export async function downloadReportExport(filters = {}, exportType) {
  const query = buildQueryString({
    ...buildReportParams(filters),
    page: undefined,
    limit: undefined,
    export_type: exportType,
  });

  const res = await apiFetchRaw(`/stock-verification/product-summary?${query}`);

  if (!res.ok) {
    let message = 'Export failed';
    try {
      const json = await res.json();
      message = json.message || json.error || message;
    } catch {
      // binary or empty error body
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const extension = exportType === 'pdf' ? 'pdf' : 'xlsx';
  const filename = parseFilename(
    res,
    `stock-verification-report.${extension}`,
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
