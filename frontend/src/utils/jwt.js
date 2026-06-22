export function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null

  try {
    const segment = token.split('.')[1]
    if (!segment) return null

    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const json = atob(padded)
    return JSON.parse(json)
  } catch {
    return null
  }
}
