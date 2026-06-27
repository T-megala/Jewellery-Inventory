const TECHNICAL_PATTERNS = [
  /\/api\//i,
  /https?:\/\//i,
  /localhost/i,
  /failed to fetch/i,
  /network\s*error/i,
  /networkerror/i,
  /econnrefused/i,
  /etimedout/i,
  /enotfound/i,
  /cors/i,
  /unexpected server response/i,
  /internal server error/i,
  /invalid json/i,
  /entity\.parse/i,
  /\bsql\b/i,
  /\ber_/i,
  /duplicate entry/i,
  /must be a positive integer/i,
  /branchids must be/i,
  /invalid permission ids/i,
  /authentication token is required/i,
  /refresh token is missing/i,
  /\bat\s+.+\(.+:\d+:\d+\)/i,
  /\.(?:js|jsx|ts|tsx):\d+/i,
  /\bstack\b/i,
  /\bjwt\b/i,
  /\baxios\b/i,
  /\bfetch\b/i,
  /request failed/i,
  /status code\s*\d{3}/i,
  /\b500\b.*\berror/i,
];

const GENERIC_SERVER_MESSAGES = new Set([
  'request failed',
  'internal server error',
  'unexpected server response',
  'failed to fetch',
]);

function isTechnicalMessage(message) {
  const text = String(message || '').trim();
  if (!text) return true;
  if (text.length > 220) return true;

  const lower = text.toLowerCase();
  if (GENERIC_SERVER_MESSAGES.has(lower)) return true;

  return TECHNICAL_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Return a user-safe error message for UI display.
 * In production, technical / API / network details are replaced with fallback text.
 */
export function toUserErrorMessage(message, fallback = 'Something went wrong. Please try again.') {
  const text = String(message ?? '').trim();

  if (!import.meta.env.PROD) {
    return text || fallback;
  }

  if (!text || isTechnicalMessage(text)) {
    return fallback;
  }

  return text;
}

export function createUserError(message, fallback) {
  return new Error(toUserErrorMessage(message, fallback));
}
