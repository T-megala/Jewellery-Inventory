const LOCAL_API = '/api/v1';

const API_BASE = import.meta.env.VITE_API_BASE_URL || LOCAL_API;

export function buildQueryString(params) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

async function parseResponse(res) {
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error('Unexpected server response');
  }

  if (!res.ok || !json.success) {
    throw new Error(json.message || 'Request failed');
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

export async function apiFetchReport(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
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
