export const NETWORK_ERROR_FALLBACK = 'Unable to connect. Please check your network and try again.';

const NETWORK_ERROR_PATTERNS = [
  /failed to fetch/i,
  /network\s*error/i,
  /networkerror/i,
  /load failed/i,
  /econnrefused/i,
  /etimedout/i,
  /enotfound/i,
  /err_internet_disconnected/i,
  /err_network_changed/i,
  /err_connection_refused/i,
  /err_name_not_resolved/i,
];

function isNetworkErrorMessage(message) {
  const text = String(message || '').trim();
  if (!text) return false;

  const lower = text.toLowerCase();
  if (lower === 'failed to fetch') return true;

  return NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Return a user-safe error message for UI display.
 * Network errors are always replaced with a friendly message; other backend
 * errors are shown as-is so users understand what went wrong.
 */
export function toUserErrorMessage(message, fallback = 'Something went wrong. Please try again.') {
  const text = String(message ?? '').trim();

  if (!text) return fallback;

  if (isNetworkErrorMessage(text)) {
    return NETWORK_ERROR_FALLBACK;
  }

  return text;
}

export function createUserError(message, fallback) {
  return new Error(toUserErrorMessage(message, fallback));
}
