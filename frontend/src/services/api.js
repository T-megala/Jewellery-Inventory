import { API_BASE, apiUrl } from '../config/apiConfig.js';
import { createUserError } from '../utils/userErrorMessage.js';
import {
  getOperationalBranchId,
  getRefreshToken,
  getToken,
  refreshAccessToken,
  redirectToLogin,
} from './auth.js';

export { API_BASE, apiUrl };

/** Matches backend BRANCH_SCOPE_EXEMPT_PATHS — no branch filter on these APIs. */
export const BRANCH_SCOPE_EXEMPT_PREFIXES = [
  '/auth',
  '/branches',
  '/dropdown/branches',
  '/roles',
  '/permissions',
  '/users',
  '/dashboard/branch-comparison',
];

function getRequestPathname(path) {
  const [pathname] = String(path).split('?');
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

export function isBranchScopeExemptPath(path) {
  const pathname = getRequestPathname(path);
  return BRANCH_SCOPE_EXEMPT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function resolveScopeBranch(path, options = {}) {
  if (options.scopeBranch === false) return false;
  if (options.scopeBranch === true) return true;
  return !isBranchScopeExemptPath(path);
}

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

function throwRequestError(message, fallback = 'Something went wrong. Please try again.') {
  throw createUserError(message, fallback);
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
    throwRequestError(null, 'Unable to load data. Please try again.');
  }

  if (!isSuccessResponse(res, json)) {
    throwRequestError(json?.message || json?.error, 'Something went wrong. Please try again.');
  }

  return json;
}

function buildJsonHeaders(path, options = {}) {
  const scopeBranch = resolveScopeBranch(path, options);

  return {
    'Content-Type': 'application/json',
    ...options.headers,
    ...getAuthHeaders({ scopeBranch }),
  };
}

async function handleUnauthorizedRetry(url, options, retried) {
  if (retried || !getRefreshToken()) {
    redirectToLogin()
    throw new Error('Session expired. Please log in again.')
  }

  try {
    await refreshAccessToken()
  } catch {
    redirectToLogin()
    throw new Error('Session expired. Please log in again.')
  }

  const retryHeaders = { ...options.headers };
  delete retryHeaders.Authorization;

  const scopeBranch = options.scopeBranch !== false;

  return authFetch(url, {
    ...options,
    headers: {
      ...retryHeaders,
      ...getAuthHeaders({ scopeBranch }),
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
  const scopeBranch = resolveScopeBranch(path, options);
  const requestPath = scopeBranch ? withBranchPath(path) : path;

  try {
    const res = await authFetch(apiUrl(requestPath), {
      ...options,
      scopeBranch,
      headers: buildJsonHeaders(path, options),
    });

    const json = await parseResponse(res);
    return json.data;
  } catch (err) {
    throw createUserError(
      err?.message,
      options.fallbackMessage || 'Something went wrong. Please try again.',
    );
  }
}

export async function apiUpload(path, formData, options = {}) {
  try {
    const res = await authFetch(apiUrl(path), {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
      },
      body: formData,
    });

    const json = await parseResponse(res);
    return json.data;
  } catch (err) {
    throw createUserError(
      err?.message,
      options.fallbackMessage || 'Upload failed. Please try again.',
    );
  }
}

export async function apiFetchPaged(path, options = {}) {
  const scopeBranch = resolveScopeBranch(path, options);
  const requestPath = scopeBranch ? withBranchPath(path) : path;

  try {
    const res = await authFetch(apiUrl(requestPath), {
      ...options,
      scopeBranch,
      headers: buildJsonHeaders(path, options),
    });

    const json = await parseResponse(res);

    return {
      rows: json.data || [],
      pagination: json.pagination || null,
    };
  } catch (err) {
    throw createUserError(
      err?.message,
      options.fallbackMessage || 'Unable to load list. Please try again.',
    );
  }
}

export async function apiFetchReport(path, params = {}) {
  const scopeBranch = resolveScopeBranch(path);
  const query = buildQueryString(scopeBranch ? withBranchParams(params) : params);
  const url = query ? `${path}?${query}` : path;

  try {
    const res = await authFetch(apiUrl(url), {
      method: 'GET',
      scopeBranch,
      headers: buildJsonHeaders(path),
    });

    const json = await parseResponse(res);

    return {
      rows: (json.data || []).map(normalizeReportRow),
      pagination: json.pagination || null,
      branchId: json.branchId ?? null,
      summary: {
        totalTags:
          json.pagination?.totalRecords
          ?? ((json.summary?.foundCount ?? 0)
            + (json.summary?.missingCount ?? 0)
            + (json.summary?.newCount ?? 0)),
        totalFound: json.summary?.foundCount ?? 0,
        totalMissing: json.summary?.missingCount ?? 0,
        totalNew: json.summary?.newCount ?? 0,
      },
    };
  } catch (err) {
    throw createUserError(err?.message, 'Unable to load report. Please try again.');
  }
}

/** Authenticated fetch for non-JSON responses (e.g. file downloads). */
export async function apiFetchRaw(path, options = {}) {
  const scopeBranch = resolveScopeBranch(path, options);
  const requestPath = scopeBranch ? withBranchPath(path) : path;

  return authFetch(apiUrl(requestPath), {
    ...options,
    scopeBranch,
    headers: {
      ...getAuthHeaders({ scopeBranch }),
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
