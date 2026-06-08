const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

/**
 * Placeholder auth service — swap login() with a real API call when backend is ready.
 * Expected backend endpoint: POST /api/auth/login
 * Body: { username, password }
 * Response: { token, user: { id, name, username, role } }
 */
export async function login(username, password) {
  // TODO: Replace with real API call when backend is merged
  // const res = await fetch('/api/auth/login', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ username, password }),
  // })
  // if (!res.ok) {
  //   const err = await res.json()
  //   throw new Error(err.message || 'Login failed')
  // }
  // const data = await res.json()
  // setSession(data.token, data.user)
  // return data

  await new Promise((resolve) => setTimeout(resolve, 800))

  if (username === 'admin' && password === 'admin123') {
    const user = { id: 1, name: 'Jeyachandran Admin', username, role: 'admin' }
    const token = 'mock-jwt-token'
    setSession(token, user)
    return { token, user }
  }

  throw new Error('Invalid username or password')
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser() {
  const raw = localStorage.getItem(USER_KEY)
  return raw ? JSON.parse(raw) : null
}

export function isAuthenticated() {
  return !!getToken()
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}
