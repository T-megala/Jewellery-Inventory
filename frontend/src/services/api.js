import { API_BASE, apiUrl } from '../config/apiConfig.js';
import {
  clearAuthSession,
  getOperationalBranchId,
  getRefreshToken,
  getToken,
  refreshAccessToken,
  redirectToLogin,
} from './auth.js';

export { API_BASE, apiUrl };

/** Bearer token and optional active branch scope for protected APIs. */
export function getAuthHeaders({ branchId, scopeBranch = true } = {}) {
  const token = getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  if (scopeBranch) {
    const resolvedBranchId = branchId !== undefined ? branchId : getOperationalBranchId();
    if (resolvedBranchId) {
      headers['X-Branch-Id'] = String(resolvedBranchId);
    }
  }

  return headers;
}

export function withBranchParams(params = {}, branchId) {
  const resolvedBranchId = branchId !== undefined ? branchId : getOperationalBranchId();
  if (!resolvedBranchId) return params;
  return { ...params, branchId: resolvedBranchId };
}

function withBranchPath(path, branchId) {
  const resolvedBranchId = branchId !== undefined ? branchId : getOperationalBranchId();
  if (!resolvedBranchId || path.includes('branchId=')) return path;

  const [pathname, search = ''] = path.split('?');
  const params = new URLSearchParams(search);
  params.set('branchId', String(resolvedBranchId));
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
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

async function parseResponse(res) {
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error('Unexpected server response');
  }

  if (!isSuccessResponse(res, json)) {
    throw new Error(getErrorMessage(json));
  }

  return json;
}

function buildJsonHeaders(options = {}) {
  return {
    'Content-Type': 'application/json',
    ...options.headers,
    ...getAuthHeaders(),
  };
}

async function handleUnauthorizedRetry(url, options, retried) {
  if (retried || !getRefreshToken()) {
    clearAuthSession();
    redirectToLogin();
    throw new Error('Session expired. Please log in again.');
  }

  try {
    await refreshAccessToken();
  } catch {
    clearAuthSession();
    redirectToLogin();
    throw new Error('Session expired. Please log in again.');
  }

  const retryHeaders = { ...options.headers };
  delete retryHeaders.Authorization;

  return authFetch(url, {
    ...options,
    headers: {
      ...retryHeaders,
      ...getAuthHeaders(),
    },
  }, true);
}

/**
 * Authenticated fetch — sends access token; on 401, refreshes tokens and retries once.
 */
export async function authFetch(url, options = {}, retried = false) {
  const res = await fetch(url, {
    ...options,
    headers: options.headers,
  });

  if (res.status === 401 && getToken()) {
    return handleUnauthorizedRetry(url, options, retried);
  }

  return res;
}

export async function apiFetch(path, options = {}) {
  const res = await authFetch(apiUrl(withBranchPath(path)), {
    ...options,
    headers: buildJsonHeaders(options),
  });

  const json = await parseResponse(res);
  return json.data;
}

export async function apiUpload(path, formData) {
  const res = await authFetch(apiUrl(path), {
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
  const res = await authFetch(apiUrl(withBranchPath(path)), {
    ...options,
    headers: buildJsonHeaders(options),
  });

  const json = await parseResponse(res);

  return {
    rows: json.data || [],
    pagination: json.pagination || null,
  };
}

export async function apiFetchReport(path, params = {}) {
  const query = buildQueryString(withBranchParams(params));
  const url = query ? `${path}?${query}` : path;

  const res = await authFetch(apiUrl(url), {
    method: 'GET',
    headers: buildJsonHeaders(),
  });

  const json = await parseResponse(res);

  return {
    rows: (json.data || []).map(normalizeReportRow),
    pagination: json.pagination || null,
    branchId: json.branchId ?? null,
    summary: {
      totalTags: json.pagination?.totalRecords ?? json.data?.length ?? 0,
      totalFound: json.summary?.foundCount ?? 0,
      totalMissing: json.summary?.missingCount ?? 0,
      totalNew: json.summary?.newCount ?? 0,
    },
  };
}

/** Authenticated fetch for non-JSON responses (e.g. file downloads). */
export async function apiFetchRaw(path, options = {}) {
  return authFetch(apiUrl(withBranchPath(path)), {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  });
}

function normalizeReportRow(row) {
  return {
    id: row.id,
    verificationDate: row.verificationDate,
    product: row.productName ?? row.product ?? '',
    subProduct: row.subProductName ?? row.subProduct ?? '',
    counter: row.centerName ?? row.counter ?? '',
    tagNo: row.tagNo ?? '',
    pieces: row.pieces ?? row.product?.pieces ?? null,
    status: row.status ?? '',
    branch: row.branch
      ? { id: row.branch.id, name: row.branch.name }
      : null,
  };
}
