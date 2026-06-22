import { API_BASE, apiUrl } from '../config/apiConfig.js';
import { getToken, logout } from './auth.js';
import { getUserFriendlyErrorMessage } from '../utils/userFriendlyError.js';

export { API_BASE, apiUrl };

/** Bearer token for all API calls except login. */
export function getAuthHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function buildQueryString(params) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

function getErrorMessage(json, fallback = 'Request failed') {
  return json?.message || json?.error || fallback;
}

function isSuccessResponse(res, json) {
  if (!res.ok) {
    return false;
  }

  if (json?.success === false || json?.status === false) {
    return false;
  }

  return json?.success === true || json?.status === true || json?.data !== undefined;
}

function createApiError(message, status) {
  const error = new Error(getUserFriendlyErrorMessage(message, status));
  error.status = status;
  return error;
}

async function parseResponse(res) {
  let json;
  try {
    json = await res.json();
  } catch {
    throw createApiError('Unexpected server response', res.status);
  }

  if (!isSuccessResponse(res, json)) {
    if (res.status === 401) {
      logout();
    }
    throw createApiError(getErrorMessage(json), res.status);
  }

  return json;
}

function buildJsonHeaders(options = {}) {
  return {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...options.headers,
  };
}

/** Authenticated GET — always sends the access token. */
export async function apiGet(path, options = {}) {
  const res = await fetch(apiUrl(path), {
    method: 'GET',
    ...options,
    headers: buildJsonHeaders(options),
  });

  return parseResponse(res);
}

export async function apiFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();

  if (method === 'GET') {
    const json = await apiGet(path, options);
    return json.data;
  }

  const res = await fetch(apiUrl(path), {
    ...options,
    headers: buildJsonHeaders(options),
  });

  const json = await parseResponse(res);
  return json.data;
}

export async function apiUpload(path, formData) {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
    },
    body: formData,
  });

  const json = await parseResponse(res);
  return json.data;
}

export async function apiFetchPaged(path, options = {}) {
  const json = await apiGet(path, options);

  return {
    rows: json.data || [],
    pagination: json.pagination || null,
  };
}

export async function apiFetchReport(path, params = {}) {
  const query = buildQueryString(params);
  const url = query ? `${path}?${query}` : path;

  const json = await apiGet(url);

  return {
    rows: (json.data || []).map(normalizeReportRow),
    pagination: json.pagination || null,
    summary: {
      totalTags: json.summary?.totalExpectedTags
        ?? json.pagination?.totalRecords
        ?? json.data?.length
        ?? 0,
      totalFound: json.summary?.totalFoundTags
        ?? json.summary?.tagCounts?.foundCount
        ?? json.summary?.foundCount
        ?? 0,
      totalMissing: json.summary?.totalMissingTags
        ?? json.summary?.tagCounts?.missingCount
        ?? json.summary?.missingCount
        ?? 0,
      totalNew: json.summary?.totalNewTags
        ?? json.summary?.tagCounts?.newCount
        ?? json.summary?.newCount
        ?? 0,
    },
  };
}

/** Authenticated fetch for non-JSON responses (e.g. file downloads). */
export async function apiFetchRaw(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();

  return fetch(apiUrl(path), {
    method,
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  });
}

function normalizeReportRow(row) {
  return {
    id: row.id ?? row.productId,
    verificationDate: row.verificationDate,
    barcode: row.barcode ?? row.tagNo ?? '',
    itemDescription: row.itemDescription ?? row.productName ?? row.product ?? '',
    closingBalQty: row.closingBalQty ?? row.pieces ?? row.product?.pieces ?? null,
    expectedQty: row.expectedQty ?? null,
    foundQty: row.foundQty ?? null,
    missingQty: row.missingQty ?? null,
    verificationPercentage: row.verificationPercentage ?? null,
    status: row.status ?? row.verificationStatus ?? '',
  };
}
