/**
 * API target — change this one line when you want to switch servers.
 *
 *   'local' → http://localhost:5005/api/v1
 *   'live'  → https://devjeweltrack.2cqr.in/api/v1
 *
 * Restart `npm run dev` after changing (Vite caches modules on save, but a refresh is enough).
 */

export const API_MODE = 'local'

const API_URLS = {
  local: 'http://localhost:5005/api/v1',
  live: 'https://devjeweltrack.2cqr.in/api/v1',
}

export const API_BASE = API_URLS[API_MODE] ?? API_URLS.local

export function getApiModeLabel() {
  return API_MODE === 'live' ? 'Live' : 'Local'
}
