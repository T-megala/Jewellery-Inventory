import { apiUrl } from './api.js'

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'
export const PENDING_BRANCH_KEY = 'auth_pending_branch_selection'
export const SELECTED_BRANCHES_KEY = 'auth_selected_branch_ids'

function normalizeUser(user) {
  if (!user) return null

  return {
    ...user,
    branches: (user.branches || []).map((branch) => ({
      id: branch.id,
      name: branch.name,
    })),
    branch: user.branch ?? null,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
  }
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
    user,
    permissions: data.permissions ?? user.permissions ?? [],
  }
}

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

  if (!res.ok) {
    throw new Error(json?.message || 'Login failed')
  }

  const data = parseAuthResponse(json, 'Login failed')
  setSession(data.token, data.user)
  return data
}

export async function switchBranch(branchId) {
  const token = getToken()

  if (!token) {
    throw new Error('Authentication token is required')
  }

  const res = await fetch(apiUrl('/auth/switch-branch'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ branchId }),
  })

  let json
  try {
    json = await res.json()
  } catch {
    throw new Error('Unexpected server response')
  }

  if (!res.ok) {
    throw new Error(json?.message || 'Failed to switch branch')
  }

  const data = parseAuthResponse(json, 'Failed to switch branch')
  setSession(data.token, data.user)
  sessionStorage.removeItem(PENDING_BRANCH_KEY)
  return data
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(normalizeUser(user)))
}

export function markPendingBranchSelection() {
  sessionStorage.setItem(PENDING_BRANCH_KEY, '1')
}

export function clearPendingBranchSelection() {
  sessionStorage.removeItem(PENDING_BRANCH_KEY)
}

export function hasPendingBranchSelection() {
  return sessionStorage.getItem(PENDING_BRANCH_KEY) === '1'
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? normalizeUser(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function getUserBranches(user = getUser()) {
  return user?.branches ?? []
}

export function setSelectedBranchIds(branchIds) {
  const ids = [...new Set((branchIds || []).map(Number).filter(Boolean))]
  localStorage.setItem(SELECTED_BRANCHES_KEY, JSON.stringify(ids))
}

export function getSelectedBranchIds(user = getUser()) {
  try {
    const raw = localStorage.getItem(SELECTED_BRANCHES_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map(Number)
      }
    }
  } catch {
    // ignore invalid storage
  }

  return getUserBranches(user).map((branch) => branch.id)
}

export function clearSelectedBranchIds() {
  localStorage.removeItem(SELECTED_BRANCHES_KEY)
}

export function resolveActiveBranchId(selectedIds, user = getUser()) {
  const allowed = new Set(getUserBranches(user).map((branch) => branch.id))
  const valid = selectedIds.filter((id) => allowed.has(id))

  if (!valid.length) return null

  const currentId = user?.branch?.id
  if (currentId && valid.includes(currentId)) return currentId

  return valid[0]
}

export async function completeBranchSelection(selectedIds) {
  const user = getUser()
  const activeId = resolveActiveBranchId(selectedIds, user)

  if (!activeId) {
    throw new Error('Please select at least one branch.')
  }

  setSelectedBranchIds(selectedIds)

  if (user?.branch?.id !== activeId) {
    await switchBranch(activeId)
  } else {
    clearPendingBranchSelection()
  }

  return activeId
}

export function needsBranchSelection(user = getUser()) {
  return getUserBranches(user).length > 1
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

export function getUserBranch(user = getUser()) {
  return user?.branch ?? null
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

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  clearSelectedBranchIds()
  clearPendingBranchSelection()
}
