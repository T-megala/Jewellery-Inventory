import { apiUrl } from './api.js'
import { decodeJwtPayload } from '../utils/jwt.js'

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'
const OPERATIONAL_BRANCH_KEY = 'auth_operational_branch'
export const PENDING_BRANCH_KEY = 'auth_pending_branch_selection'
export const BRANCH_CHANGE_EVENT = 'auth:branch-changed'
export const ALL_BRANCHES_VALUE = 'all'

function normalizeBranch(branch) {
  return {
    id: Number(branch.id),
    name: branch.name,
  }
}

function resolveActiveBranch(branches, selectedBranches, branchId) {
  const activeId = Number(branchId) || null
  if (!activeId) return null

  return (
    selectedBranches.find((branch) => branch.id === activeId)
    ?? branches.find((branch) => branch.id === activeId)
    ?? { id: activeId, name: `Branch ${activeId}` }
  )
}

export function normalizeUser(user, token = getToken()) {
  if (!user) return null

  const branches = (user.branches || []).map(normalizeBranch)
  const selectedBranches = (user.selectedBranches || branches).map(normalizeBranch)
  const payload = token ? decodeJwtPayload(token) : null
  const activeBranchId = Number(
    payload?.branchId
    ?? selectedBranches[0]?.id
    ?? branches[0]?.id
    ?? 0,
  ) || null

  return {
    ...user,
    branches,
    selectedBranches,
    activeBranchId,
    activeBranch: resolveActiveBranch(branches, selectedBranches, activeBranchId),
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

/** Branch used on API calls — null when "All branches" is selected (default). */
export function getOperationalBranchId() {
  const raw = sessionStorage.getItem(OPERATIONAL_BRANCH_KEY)
  if (!raw || raw === ALL_BRANCHES_VALUE) return null

  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/** Current dashboard dropdown value — defaults to all branches. */
export function getOperationalBranchValue() {
  const raw = sessionStorage.getItem(OPERATIONAL_BRANCH_KEY)
  if (!raw || raw === ALL_BRANCHES_VALUE) return ALL_BRANCHES_VALUE

  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : ALL_BRANCHES_VALUE
}

export function setOperationalBranch(value) {
  if (value === ALL_BRANCHES_VALUE) {
    sessionStorage.setItem(OPERATIONAL_BRANCH_KEY, ALL_BRANCHES_VALUE)
  } else if (value) {
    sessionStorage.setItem(OPERATIONAL_BRANCH_KEY, String(Number(value)))
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

  const user = normalizeUser(data.user, data.token)

  return {
    token: data.token,
    user,
    permissions: data.permissions ?? user.permissions ?? [],
  }
}

function applyAuthSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(normalizeUser(user, token)))
  dispatchBranchChange()
}

/** Login — optional branchIds for one-step session selection. */
export async function login(username, password, branchIds = null) {
  const body = { username, password }

  if (Array.isArray(branchIds) && branchIds.length) {
    body.branchIds = branchIds
  }

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
  applyAuthSession(data.token, data.user)
  setOperationalBranch(ALL_BRANCHES_VALUE)
  return data
}

export async function selectBranches(branchIds) {
  const token = getToken()

  if (!token) {
    throw new Error('Authentication token is required')
  }

  const res = await fetch(apiUrl('/auth/select-branches'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ branchIds }),
  })

  let json
  try {
    json = await res.json()
  } catch {
    throw new Error('Unexpected server response')
  }

  if (!res.ok) {
    throw new Error(json?.message || 'Failed to select branches')
  }

  const data = parseAuthResponse(json, 'Failed to select branches')
  applyAuthSession(data.token, data.user)
  setOperationalBranch(ALL_BRANCHES_VALUE)
  clearPendingBranchSelection()
  return data
}

export async function fetchProfile() {
  const token = getToken()

  if (!token) {
    throw new Error('Authentication token is required')
  }

  const res = await fetch(apiUrl('/auth/profile'), {
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
  const user = normalizeUser(data.user, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  dispatchBranchChange()
  return user
}

export function setSession(token, user) {
  applyAuthSession(token, user)
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

/** All branches assigned to the user (login picker). */
export function getUserBranches(user = getUser()) {
  return user?.branches ?? []
}

/** Branches selected for this session (Level 1). */
export function getSessionBranches(user = getUser()) {
  return user?.selectedBranches ?? []
}

export function getSelectedBranchIds(user = getUser()) {
  const fromUser = getSessionBranches(user).map((branch) => branch.id)
  if (fromUser.length) return fromUser

  const payload = decodeJwtPayload(getToken())
  if (Array.isArray(payload?.selectedBranchIds) && payload.selectedBranchIds.length) {
    return payload.selectedBranchIds.map(Number)
  }

  return getUserBranches(user).map((branch) => branch.id)
}

export function getActiveBranchId(user = getUser()) {
  if (user?.activeBranchId) return user.activeBranchId

  const payload = decodeJwtPayload(getToken())
  const fromToken = Number(payload?.branchId)
  if (fromToken) return fromToken

  const selected = getSelectedBranchIds(user)
  return selected[0] ?? null
}

export function getActiveBranch(user = getUser()) {
  if (user?.activeBranch) return user.activeBranch

  const activeId = getActiveBranchId(user)
  if (!activeId) return null

  return getSessionBranches(user).find((branch) => branch.id === activeId)
    ?? getUserBranches(user).find((branch) => branch.id === activeId)
    ?? { id: activeId, name: `Branch ${activeId}` }
}

/** @deprecated Use getActiveBranch() */
export function getUserBranch(user = getUser()) {
  return getActiveBranch(user)
}

export async function completeBranchSelection(selectedIds) {
  const ids = [...new Set((selectedIds || []).map(Number).filter(Boolean))]

  if (!ids.length) {
    throw new Error('Please select at least one branch.')
  }

  await selectBranches(ids)
  return getActiveBranchId()
}

export function needsBranchSelection(user = getUser()) {
  return getUserBranches(user).length > 1
}

export function needsActiveBranchSwitcher(user = getUser()) {
  return getSessionBranches(user).length > 1
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

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  clearPendingBranchSelection()
  clearOperationalBranch()
  dispatchBranchChange()
}
