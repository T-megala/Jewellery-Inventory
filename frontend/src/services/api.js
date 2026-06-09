export const API_BASE = 'https://devjeweltrack.2cqr.in/api/v1';

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

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const json = await parseResponse(res);
  return json.data;
}

export async function apiUpload(path, formData) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    body: formData,
  });

  const json = await parseResponse(res);
  return json.data;
}

export async function apiFetchPaged(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const json = await parseResponse(res);

  return {
    rows: json.data || [],
    pagination: json.pagination || null,
  };
}

export async function apiFetchReport(path, params = {}) {
  const query = buildQueryString(params);
  const url = query ? `${path}?${query}` : path;

  const res = await fetch(`${API_BASE}${url}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const json = await parseResponse(res);

  return {
    rows: (json.data || []).map(normalizeReportRow),
    pagination: json.pagination || null,
    summary: {
      totalTags: json.pagination?.totalRecords ?? json.data?.length ?? 0,
      totalFound: json.summary?.foundCount ?? 0,
      totalMissing: json.summary?.missingCount ?? 0,
      totalNew: json.summary?.newCount ?? 0,
    },
  };
}

function normalizeReportRow(row) {
  return {
    id: row.id,
    verificationDate: row.verificationDate,
    product: row.productName ?? row.product ?? '',
    subProduct: row.subProductName ?? row.subProduct ?? '',
    counter: row.centerName ?? row.counter ?? '',
    tagNo: row.tagNo ?? '',
    status: row.status ?? '',
  };
}
