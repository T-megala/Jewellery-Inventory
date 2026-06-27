import { apiUrl, authFetch } from './api.js'
import { decodeJwtPayload } from '../utils/jwt.js'

const TOKEN_KEY = 'auth_token'
const REFRESH_TOKEN_KEY = 'auth_refresh_token'
const USER_KEY = 'auth_user'
const SESSION_BRANCHES_KEY = 'auth_session_branches'
const OPERATIONAL_BRANCH_KEY = 'auth_operational_branch'
export const BRANCH_CHANGE_EVENT = 'auth:branch-changed'
export const AUTH_SESSION_EVENT = 'auth:session-changed'
export const ALL_BRANCHES_VALUE = 'all'

/** Auth lives in sessionStorage — survives refresh, cleared when the tab closes. */
const authStorage = sessionStorage

function clearLegacyAuthStorage() {
  const legacyKeys = [
    TOKEN_KEY,
    REFRESH_TOKEN_KEY,
    USER_KEY,
    'auth_tab_id',
    'auth_login_epoch',
    'auth_tab_epochs',
  ]
  for (const key of legacyKeys) {
    localStorage.removeItem(key)
  }
}

clearLegacyAuthStorage()

function dispatchAuthSessionChange() {
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EVENT))
}

function normalizeBranch(branch) {
  return {
    id: Number(branch.id),
    name: branch.name,
  }
}

function readStoredSessionBranches() {
  try {
    const raw = authStorage.getItem(SESSION_BRANCHES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(normalizeBranch) : []
  } catch {
    return []
  }
}

function writeStoredSessionBranches(branches) {
  const normalized = (branches || []).map(normalizeBranch)
  authStorage.setItem(SESSION_BRANCHES_KEY, JSON.stringify(normalized))
  return normalized
}

function stripLoginUser(user) {
  if (!user) return null

  const {
    branches: _branches,
    selectedBranches: _selectedBranches,
    activeBranch: _activeBranch,
    activeBranchId: _activeBranchId,
    ...profile
  } = user

  return profile
}

export function normalizeUser(user) {
  if (!user) return null

  return {
    ...stripLoginUser(user),
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
  }
}

function dispatchBranchChange() {
  window.dispatchEvent(new CustomEvent(BRANCH_CHANGE_EVENT, {
    detail: {
      activeBranchId: getActiveBranchId(),
      operationalBranchId: getOperationalBranchId(),
      operationalValue: getOperationalBranchValue(),
      selectedBranchIds: getSelectedBranchIds(),
    },
  }))
}

export function isAllBranchesScope() {
  const raw = sessionStorage.getItem(OPERATIONAL_BRANCH_KEY)
  return !raw || raw === ALL_BRANCHES_VALUE
}

/** Drop stale dashboard filter when it is outside the current session branches. */
export function sanitizeOperationalBranch() {
  const raw = sessionStorage.getItem(OPERATIONAL_BRANCH_KEY)
  if (!raw || raw === ALL_BRANCHES_VALUE) return

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    sessionStorage.setItem(OPERATIONAL_BRANCH_KEY, ALL_BRANCHES_VALUE)
    return
  }

  const selectedIds = getSelectedBranchIds()
  if (selectedIds.length > 0 && !selectedIds.includes(parsed)) {
    sessionStorage.setItem(OPERATIONAL_BRANCH_KEY, ALL_BRANCHES_VALUE)
  }
}

/** Branch used on API calls — null when "All branches" is selected (default). */
export function getOperationalBranchId() {
  sanitizeOperationalBranch()

  const raw = sessionStorage.getItem(OPERATIONAL_BRANCH_KEY)
  if (!raw || raw === ALL_BRANCHES_VALUE) return null

  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/** Current dashboard dropdown value — defaults to all branches. */
export function getOperationalBranchValue() {
  sanitizeOperationalBranch()

  const raw = sessionStorage.getItem(OPERATIONAL_BRANCH_KEY)
  if (!raw || raw === ALL_BRANCHES_VALUE) return ALL_BRANCHES_VALUE

  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : ALL_BRANCHES_VALUE
}

export function setOperationalBranch(value) {
  if (value === ALL_BRANCHES_VALUE) {
    sessionStorage.setItem(OPERATIONAL_BRANCH_KEY, ALL_BRANCHES_VALUE)
  } else if (value) {
    const id = Number(value)
    const selectedIds = getSelectedBranchIds()

    if (Number.isInteger(id) && id > 0 && (!selectedIds.length || selectedIds.includes(id))) {
      sessionStorage.setItem(OPERATIONAL_BRANCH_KEY, String(id))
    } else {
      sessionStorage.setItem(OPERATIONAL_BRANCH_KEY, ALL_BRANCHES_VALUE)
    }
  } else {
    sessionStorage.removeItem(OPERATIONAL_BRANCH_KEY)
  }
  dispatchBranchChange()
}

export function clearOperationalBranch() {
  sessionStorage.removeItem(OPERATIONAL_BRANCH_KEY)
}

function parseAuthResponse(json, fallbackError = 'Request failed') {
  if (!json || json?.success === false) {
    throw new Error(json?.message || fallbackError)
  }

  const data = json.data ?? json

  if (!data.token || !data.user) {
    throw new Error('Authentication response is missing token data')
  }

  const user = normalizeUser(data.user)

  return {
    token: data.token,
    refreshToken: data.refreshToken ?? null,
    user,
    permissions: data.permissions ?? user.permissions ?? [],
  }
}

function applyAuthSession(token, user, refreshToken) {
  authStorage.setItem(TOKEN_KEY, token)
  if (refreshToken) {
    authStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  }
  const normalizedUser = normalizeUser(stripLoginUser(user))
  authStorage.setItem(USER_KEY, JSON.stringify(normalizedUser))
  clearLegacyAuthStorage()
  sanitizeOperationalBranch()
  dispatchBranchChange()
  dispatchAuthSessionChange()
}

/** Login — session branches are loaded separately via GET /branches. */
export async function login(username, password) {
  const body = { username, password }

  const res = await fetch(apiUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  let json
  try {
    json = await res.json()
  } catch {
    throw new Error('Unexpected server response')
  }

  if (!res.ok) {
    throw new Error(json?.message || 'Login failed')
  }

  const data = parseAuthResponse(json, 'Login failed')
  applyAuthSession(data.token, data.user, data.refreshToken)
  await refreshSessionBranches()
  setOperationalBranch(ALL_BRANCHES_VALUE)
  return data
}

/** Persist branch list from GET /branches — never from login response. */
export function updateSessionBranches(branches) {
  const normalized = writeStoredSessionBranches(branches)
  sanitizeOperationalBranch()
  dispatchBranchChange()
  dispatchAuthSessionChange()
  return normalized
}

/** Load current user's branches with the access token and sync session storage. */
export async function refreshSessionBranches() {
  const token = getToken()

  if (!token) {
    return null
  }

  const res = await authFetch(apiUrl('/branches'), {
    headers: { Authorization: `Bearer ${token}` },
  })

  let json
  try {
    json = await res.json()
  } catch {
    throw new Error('Unexpected server response')
  }

  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || 'Failed to load branches')
  }

  const data = json.data ?? json
  const branches = Array.isArray(data) ? data : []
  return updateSessionBranches(branches)
}

export async function fetchProfile() {
  const token = getToken()

  if (!token) {
    throw new Error('Authentication token is required')
  }

  const res = await authFetch(apiUrl('/auth/profile'), {
    headers: { Authorization: `Bearer ${token}` },
  })

  let json
  try {
    json = await res.json()
  } catch {
    throw new Error('Unexpected server response')
  }

  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || 'Failed to load profile')
  }

  const data = json.data ?? json
  const user = normalizeUser(stripLoginUser(data.user))
  authStorage.setItem(USER_KEY, JSON.stringify(user))
  clearLegacyAuthStorage()
  await refreshSessionBranches()
  return user
}

export function setSession(token, user, refreshToken) {
  applyAuthSession(token, user, refreshToken)
}

let refreshPromise = null

/** Exchange refresh token for a new access token (deduped when called concurrently). */
export async function refreshAccessToken() {
  const refreshToken = getRefreshToken()

  if (!refreshToken) {
    throw new Error('Refresh token is missing')
  }

  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch(apiUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })

      let json
      try {
        json = await res.json()
      } catch {
        throw new Error('Unexpected server response')
      }

      if (!res.ok) {
        throw new Error(json?.message || 'Session expired')
      }

      const data = parseAuthResponse(json, 'Session expired')
      applyAuthSession(data.token, data.user, data.refreshToken)
      await refreshSessionBranches()
      return data.token
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export function getToken() {
  return authStorage.getItem(TOKEN_KEY)
}

export function getRefreshToken() {
  return authStorage.getItem(REFRESH_TOKEN_KEY)
}

export function getUser() {
  try {
    const raw = authStorage.getItem(USER_KEY)
    return raw ? normalizeUser(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

/** Branches for header/filter — always from GET /branches, never login response. */
export function getSessionBranches() {
  return readStoredSessionBranches()
}

export function getSelectedBranchIds() {
  return getSessionBranches().map((branch) => branch.id)
}

export function getActiveBranchId() {
  const payload = decodeJwtPayload(getToken())
  const fromToken = Number(payload?.branchId)
  if (fromToken) return fromToken

  const session = getSessionBranches()
  return session[0]?.id ?? null
}

export function getActiveBranch() {
  const activeId = getActiveBranchId()
  if (!activeId) return null

  return getSessionBranches().find((branch) => branch.id === activeId)
    ?? { id: activeId, name: `Branch ${activeId}` }
}

export function getUserDisplayName(user = getUser()) {
  if (!user) return 'User'
  return user.fullName || user.name || user.username || 'User'
}

export function getUserRoleLabel(user = getUser()) {
  if (!user?.role) return 'Staff'
  if (typeof user.role === 'string') return user.role
  return user.role.name || 'Staff'
}

export function getUserPermissions(user = getUser()) {
  return Array.isArray(user?.permissions) ? user.permissions : []
}

export function hasPermission(permission, user = getUser()) {
  return getUserPermissions(user).includes(permission)
}

export function hasAnyPermission(permissions = [], user = getUser()) {
  if (!permissions.length) return true
  const granted = getUserPermissions(user)
  if (!granted.length) return true
  return permissions.some((permission) => granted.includes(permission))
}

export function isAuthenticated() {
  return !!getToken()
}

export function isSessionValid() {
  if (!isAuthenticated()) return false
  return true
}

export function clearAuthSession() {
  authStorage.removeItem(TOKEN_KEY)
  authStorage.removeItem(REFRESH_TOKEN_KEY)
  authStorage.removeItem(USER_KEY)
  authStorage.removeItem(SESSION_BRANCHES_KEY)
  clearLegacyAuthStorage()
  clearOperationalBranch()
  dispatchBranchChange()
  dispatchAuthSessionChange()
}

export function logout() {
  clearAuthSession()
}

const LOGIN_PATH = '/login'

export function redirectToLogin() {
  window.location.replace(LOGIN_PATH)
}

/** Reload pages restored from back/forward cache so route loaders re-check auth. */
export function installAuthNavigationGuards() {
  if (typeof window === 'undefined') return undefined

  function handlePageShow(event) {
    if (event.persisted) {
      window.location.reload()
    }
  }

  window.addEventListener('pageshow', handlePageShow)

  return () => {
    window.removeEventListener('pageshow', handlePageShow)
  }
}
