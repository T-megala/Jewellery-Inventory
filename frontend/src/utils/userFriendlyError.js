const AUTH_PATTERN = /token|unauthorized|authentication|session expired|not authenticated/i
const NETWORK_PATTERN = /failed to fetch|network|load failed|connection refused/i
const TECHNICAL_PATTERN = /backend|api|json|endpoint|sql|database|exception|unexpected server/i

export function getUserFriendlyErrorMessage(message, status) {
  const raw = String(message || '').trim()

  if (status === 401 || AUTH_PATTERN.test(raw)) {
    return 'Your session has expired. Please sign in again.'
  }

  if (status === 403) {
    return 'You do not have permission to view this content.'
  }

  if (status === 404) {
    return 'The requested information could not be found.'
  }

  if (Number(status) >= 500) {
    return 'The server is temporarily unavailable. Please try again later.'
  }

  if (NETWORK_PATTERN.test(raw) || raw === 'Unexpected server response') {
    return 'Unable to reach the server. Please check your connection and try again.'
  }

  if (TECHNICAL_PATTERN.test(raw)) {
    return 'Something went wrong. Please try again.'
  }

  if (!raw) {
    return 'Something went wrong. Please try again.'
  }

  return raw
}

export function isSessionExpiredError(message, status) {
  return status === 401 || AUTH_PATTERN.test(String(message || ''))
}

export function isConnectionError(message) {
  const friendly = getUserFriendlyErrorMessage(message)
  return NETWORK_PATTERN.test(String(message || ''))
    || friendly === 'Unable to reach the server. Please check your connection and try again.'
    || friendly === 'The server is temporarily unavailable. Please try again later.'
}
