/**
 * API target — change API_MODE when you want to switch servers.
 *
 *   'local' → http://localhost:5005/api/v1
 *   'live'  → https://devjeweltrack.2cqr.in/api/v1
 */

export const API_MODE = 'live' // 'local' or 'live'

const API_ORIGINS = {
  local: 'http://localhost:5005',
  live: 'https://devjeweltrack.2cqr.in',
}

/** Always use this prefix — all backend routes are under /api/v1 */
export const API_V1_PREFIX = '/api/v1'

export const API_ORIGIN = API_ORIGINS[API_MODE] ?? API_ORIGINS.local

/** Full base URL including /api/v1 */
export const API_BASE = `${API_ORIGIN}${API_V1_PREFIX}`

/**
 * Build a full API URL. Ensures /api/v1 is always present.
 * @param {string} path e.g. '/products/list' or 'products/import'
 */
export function apiUrl(path = '') {
  const segment = path.startsWith('/') ? path : `/${path}`

  if (segment.startsWith(API_V1_PREFIX)) {
    return `${API_ORIGIN}${segment}`
  }

  return `${API_BASE}${segment}`
}

export function getApiModeLabel() {
  return API_MODE === 'live' ? 'Live' : 'Local'
}
