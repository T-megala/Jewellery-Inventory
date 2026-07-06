import { DEFAULT_PAGE_SIZE } from '../components/TablePagination.jsx';
import { createUserError } from '../utils/userErrorMessage.js';
import { apiFetchRaw, apiFetchReport, authFetch, buildQueryString, getAuthHeaders, withBranchParams } from './api.js';
import { apiUrl } from '../config/apiConfig.js';

function buildReportParams(filters = {}) {
  return {
    page: filters.page ?? 1,
    limit: filters.limit ?? DEFAULT_PAGE_SIZE,
    productName: filters.productName,
    subProductName: filters.subProductName,
    centerName: filters.centerName,
    status: filters.status,
    date: filters.date,
  };
}

function alignSummaryWithStatusFilter(result, status) {
  const normalizedStatus = String(status ?? '').trim().toUpperCase();
  if (!normalizedStatus) {
    return result;
  }

  const totalRows = Number(result.pagination?.totalRecords ?? 0);
  const summary = {
    ...result.summary,
    totalTags: totalRows,
    totalFound: 0,
    totalMissing: 0,
    totalNew: 0,
  };

  if (normalizedStatus === 'FOUND') {
    summary.totalFound = totalRows;
  } else if (normalizedStatus === 'MISSING') {
    summary.totalMissing = totalRows;
  } else if (normalizedStatus === 'NEW') {
    summary.totalNew = totalRows;
  }

  return { ...result, summary };
}

export async function clearTodayVerifications(date) {
  const query = buildQueryString(withBranchParams({ date }));
  const path = query ? `/stock-verification/today?${query}` : '/stock-verification/today';

  const res = await authFetch(apiUrl(path), {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw createUserError(null, 'Unable to clear verifications. Please try again.');
  }

  if (!res.ok || json?.success === false) {
    throw createUserError(
      json?.message || json?.error,
      'Unable to clear verifications. Please try again.',
    );
  }

  return json;
}

export function fetchStockVerificationReport(filters = {}) {
  const params = buildReportParams(filters);
  return apiFetchReport('/stock-verification/report', params).then((result) =>
    alignSummaryWithStatusFilter(result, params.status),
  );
}

function parseFilename(res, fallback) {
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallback;
}

export async function downloadReportExport(filters = {}, exportType) {
  const query = buildQueryString(withBranchParams({
    ...buildReportParams(filters),
    page: undefined,
    limit: undefined,
    export_type: exportType,
  }));

  const res = await apiFetchRaw(`/stock-verification/report?${query}`);

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
