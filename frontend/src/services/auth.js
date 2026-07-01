import { apiUrl } from './api.js'

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

/** Login only — no access token sent (token is received from this response). */
export async function login(username, password) {
  const res = await fetch(apiUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

  let json
  try {
    json = await res.json()
  } catch {
    throw new Error('Unexpected server response')
  }

  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || 'Login failed')
  }

  const data = json.data || json

  if (!data.token || !data.user) {
    throw new Error('Login response is missing token data')
  }

  setSession(data.token, data.user)
  return data
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function isAuthenticated() {
  return !!getToken()
}

export const CEO_ROLE = 'ceo'

export function isCeo() {
  const user = getUser()
  return String(user?.role ?? '').trim().toLowerCase() === CEO_ROLE
}

export function getPostLoginPath() {
  return isCeo() ? '/dashboard/ceo' : '/dashboard'
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}
