import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import BackToMastersLink from '../components/BackToMastersLink.jsx'
import BranchMultiSelect from '../components/BranchMultiSelect.jsx'
import FieldError from '../components/FieldError.jsx'
import TablePagination from '../components/TablePagination.jsx'
import { fetchBranches } from '../services/branches.js'
import { fetchRoles } from '../services/roles.js'
import {
  createUser,
  deleteUser,
  fetchUsers,
  updateUser,
} from '../services/users.js'
import { hasPermission } from '../services/auth.js'
import { useBranchScope } from '../hooks/useBranchScope.js'
import '../components/BranchMultiSelect.css'
import '../components/FieldError.css'
import { mapUserSaveError, scrollToFirstFieldError } from '../utils/formValidation.js'
import './Users.css'

const DEFAULT_PAGE_SIZE = 10
const SUPER_ADMIN_ROLE = 'Super Admin'

function normalizeBranchIds(branchIds) {
  return [
    ...new Set(
      (branchIds || [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ]
}

function isSuperAdminRole(role) {
  return role?.name === SUPER_ADMIN_ROLE
}

function mergeBranchOptions(...lists) {
  const map = new Map()

  for (const list of lists) {
    for (const branch of list || []) {
      if (!branch?.id) continue
      map.set(Number(branch.id), {
        ...branch,
        id: Number(branch.id),
      })
    }
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function branchIdsEqual(left, right) {
  const a = normalizeBranchIds(left).sort((x, y) => x - y)
  const b = normalizeBranchIds(right).sort((x, y) => x - y)

  if (a.length !== b.length) return false
  return a.every((id, index) => id === b[index])
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function matchesUserSearch(user, term) {
  if (!term) return true

  const haystack = [
    user.username,
    user.role?.name,
    ...(user.branches || []).map((branch) => branch.name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(term)
}

function UserBranchTags({ branches }) {
  if (!branches?.length) {
    return <span className="users-table__branch-empty">—</span>
  }

  return (
    <div className="users-table__branch-tags">
      {branches.map((branch) => (
        <span
          key={branch.id}
          className="users-table__branch-tag"
          title={branch.name}
        >
          {branch.name}
        </span>
      ))}
    </div>
  )
}

export default function Users() {
  const canAdd = hasPermission('users.add')
  const canUpdate = hasPermission('users.update')
  const canDelete = hasPermission('users.delete')
  const showRowActions = canUpdate || canDelete
  const { operationalBranchId } = useBranchScope()
  const [users, setUsers] = useState([])
  const [branches, setBranches] = useState([])
  const [roles, setRoles] = useState([])
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [roleId, setRoleId] = useState('')
  const [selectedBranchIds, setSelectedBranchIds] = useState([])
  const [showPassword, setShowPassword] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const [loading, setLoading] = useState(true)
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const data = await fetchUsers()
      setUsers(data)
    } catch (err) {
      setError(err.message || 'Failed to load users.')
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true)

    try {
      const [branchesData, rolesData] = await Promise.all([
        fetchBranches(),
        fetchRoles(),
      ])
      setBranches(branchesData)
      setRoles(rolesData)
    } catch (err) {
      setBranches([])
      setRoles([])
      setError(err.message || 'Failed to load branches or roles.')
    } finally {
      setOptionsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
    loadOptions()
  }, [loadUsers, loadOptions])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!showForm) return undefined

    const pageContent = document.querySelector('.page-content')
    document.body.classList.add('users-modal-open')
    document.documentElement.classList.add('users-modal-open')

    const prevPageOverflow = pageContent?.style.overflow
    if (pageContent) {
      pageContent.style.overflow = 'hidden'
    }

    return () => {
      document.body.classList.remove('users-modal-open')
      document.documentElement.classList.remove('users-modal-open')
      if (pageContent) {
        pageContent.style.overflow = prevPageOverflow || ''
      }
    }
  }, [showForm])

  const filteredUsers = useMemo(() => {
    const term = searchInput.trim().toLowerCase()
    const branchId = operationalBranchId

    return users.filter((user) => {
      if (branchId && !(user.branches || []).some((branch) => branch.id === branchId)) {
        return false
      }

      return matchesUserSearch(user, term)
    })
  }, [users, searchInput, operationalBranchId])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize))

  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredUsers.slice(start, start + pageSize)
  }, [filteredUsers, page, pageSize])

  useEffect(() => {
    setPage(1)
  }, [searchInput, operationalBranchId, pageSize])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const selectedRole = useMemo(
    () => roles.find((role) => Number(role.id) === Number(roleId)) ?? null,
    [roles, roleId],
  )

  const isSuperAdmin = isSuperAdminRole(selectedRole)

  const formBranches = useMemo(
    () => mergeBranchOptions(branches, editingUser?.branches),
    [branches, editingUser],
  )

  function resetFormErrors() {
    setFieldErrors({})
    setFormError('')
  }

  function clearFieldError(key) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function resetForm() {
    setUsername('')
    setPassword('')
    setRoleId('')
    setSelectedBranchIds([])
    setShowPassword(false)
    setEditingId(null)
    setEditingUser(null)
    setShowForm(false)
    resetFormErrors()
  }

  function handleAddClick() {
    if (!canAdd) return
    setEditingId(null)
    setEditingUser(null)
    setUsername('')
    setPassword('')
    setRoleId(roles[0]?.id ? String(roles[0].id) : '')
    setSelectedBranchIds([])
    setShowPassword(false)
    setError('')
    resetFormErrors()
    setNotice('')
    setShowForm(true)
  }

  function handleEdit(user) {
    if (!canUpdate) return
    const userBranchIds = normalizeBranchIds((user.branches || []).map((branch) => branch.id))

    setEditingId(user.id)
    setEditingUser(user)
    setUsername(user.username)
    setPassword('')
    setRoleId(user.role?.id ? String(user.role.id) : '')
    setSelectedBranchIds(userBranchIds)
    setShowPassword(false)
    setError('')
    resetFormErrors()
    setNotice('')
    setShowForm(true)
  }

  function toggleBranch(branchId) {
    const id = Number(branchId)

    setSelectedBranchIds((prev) => {
      const normalized = normalizeBranchIds(prev)

      if (normalized.includes(id)) {
        return normalized.filter((value) => value !== id)
      }

      return [...normalized, id]
    })
    clearFieldError('branches')
  }

  function handleSelectAllBranches(branchIds) {
    setSelectedBranchIds(normalizeBranchIds(branchIds))
    clearFieldError('branches')
  }

  function validateForm() {
    const errors = {}
    const trimmedUsername = username.trim()

    if (!trimmedUsername) {
      errors.username = 'Username is required.'
    }

    if (!editingId && !password) {
      errors.password = 'Password is required.'
    } else if (password && password.length < 6) {
      errors.password = 'Password must be at least 6 characters.'
    }

    if (!roleId) {
      errors.roleId = 'Role is required.'
    }

    if (!isSuperAdmin && selectedBranchIds.length === 0) {
      errors.branches = 'Select at least one branch.'
    }

    setFieldErrors(errors)
    setFormError('')

    if (Object.keys(errors).length) {
      scrollToFirstFieldError(errors)
      return false
    }

    return true
  }

  async function handleSubmit(e) {
    e.preventDefault()
    resetFormErrors()
    setNotice('')

    if (!validateForm()) return

    const isEdit = Boolean(editingId)
    if (isEdit && !canUpdate) return
    if (!isEdit && !canAdd) return

    setSaving(true)

    try {
      const trimmedUsername = username.trim()
      const parsedRoleId = Number(roleId)

      if (isEdit) {
        const payload = {
          username: trimmedUsername,
        }

        if (password) {
          payload.password = password
        }

        if (Number(editingUser?.role?.id) !== parsedRoleId) {
          payload.roleId = parsedRoleId
        }

        if (!isSuperAdmin) {
          const nextBranchIds = normalizeBranchIds(selectedBranchIds)
          const currentBranchIds = (editingUser?.branches || []).map((branch) => branch.id)

          if (!branchIdsEqual(nextBranchIds, currentBranchIds)) {
            payload.branchIds = nextBranchIds
          }
        }

        await updateUser(editingId, payload)
      } else {
        const createPayload = {
          username: trimmedUsername,
          password,
          roleId: parsedRoleId,
        }

        if (!isSuperAdmin) {
          createPayload.branchIds = normalizeBranchIds(selectedBranchIds)
        }

        await createUser(createPayload)
      }

      await loadUsers()
      resetForm()
      setNotice(isEdit ? 'User updated successfully.' : 'User created successfully.')
    } catch (err) {
      const mapped = mapUserSaveError(err.message)
      if (mapped._form) {
        setFormError(mapped._form)
      } else {
        setFieldErrors(mapped)
      }
      scrollToFirstFieldError(mapped)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(user) {
    if (!canDelete) return
    if (!window.confirm(`Delete user "${user.username}"?`)) return

    setDeletingId(user.id)
    setError('')
    setNotice('')

    try {
      await deleteUser(user.id)

      if (editingId === user.id) {
        resetForm()
      }

      setNotice('User deleted successfully.')
      await loadUsers()
    } catch (err) {
      setError(err.message || 'Failed to delete user.')
    } finally {
      setDeletingId(null)
    }
  }

  function handleCloseForm() {
    if (saving) return
    resetForm()
    setError('')
    setNotice('')
  }

  const isEdit = Boolean(editingId)

  return (
    <div className={`users-page${showForm ? ' users-page--modal-open' : ''}`}>
      <BackToMastersLink />
      <section className="users-list-card">
        <div className="users-list__toolbar">
          <div className="users-list__filters">
            <div className="users-search">
              <span className="users-search__icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search user, role or branch…"
                aria-label="Search users"
              />
              {searchInput && (
                <button
                  type="button"
                  className="users-search__clear"
                  onClick={() => setSearchInput('')}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          <div className="users-list__actions">
            <span className="users-list__count">
              {filteredUsers.length.toLocaleString('en-IN')} user{filteredUsers.length === 1 ? '' : 's'}
            </span>
            {canAdd && (
              <button
                type="button"
                className="users-btn users-btn--primary users-btn--add"
                onClick={handleAddClick}
                aria-label="Add user"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span className="users-btn__label">Add User</span>
              </button>
            )}
          </div>
        </div>

        {notice && !showForm && (
          <p className="users-alert users-alert--success users-list__notice" role="status">{notice}</p>
        )}

        {error && !showForm && (
          <p className="users-alert users-alert--error users-list__notice" role="alert">{error}</p>
        )}

        <div className="users-list__body">
          <div className="users-table-scroll">
            {loading ? (
              <div className="users-loading" role="status" aria-live="polite" aria-label="Loading users">
                <div className="users-loading__spinner" aria-hidden="true">
                  <span className="users-loading__ring" />
                </div>
                <p className="users-loading__text">Loading users…</p>
              </div>
            ) : (
            <table className="users-table">
              <thead>
                <tr>
                  <th>Si.No</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Branches</th>
                  <th>Created</th>
                  {showRowActions && <th aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={showRowActions ? 6 : 5} className="users-table__empty">No users found.</td>
                  </tr>
                )}

                {paginatedUsers.map((user, index) => (
                  <tr key={user.id} className={editingId === user.id ? 'users-table__row--active' : ''}>
                    <td>{(page - 1) * pageSize + index + 1}</td>
                    <td>{user.username}</td>
                    <td>{user.role?.name || '—'}</td>
                    <td className="users-table__branches">
                      <UserBranchTags branches={user.branches} />
                    </td>
                    <td>{formatDate(user.createdAt)}</td>
                    {showRowActions && (
                      <td>
                        <div className="users-table__actions">
                          {canUpdate && (
                            <button
                              type="button"
                              className="users-btn users-btn--ghost users-btn--sm"
                              onClick={() => handleEdit(user)}
                              disabled={saving || deletingId === user.id}
                            >
                              Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              className="users-btn users-btn--danger users-btn--sm"
                              onClick={() => handleDelete(user)}
                              disabled={saving || deletingId === user.id}
                            >
                              {deletingId === user.id ? 'Deleting…' : 'Delete'}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>

          {!loading && filteredUsers.length > 0 && (
            <TablePagination
              className="users-table-pagination"
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              totalRecords={filteredUsers.length}
              rowCount={paginatedUsers.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={loading || saving || Boolean(deletingId)}
            />
          )}
        </div>
      </section>

      {showForm && createPortal(
        <div
          className="users-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="users-form-title"
        >
          <button
            type="button"
            className="users-modal__backdrop"
            onClick={handleCloseForm}
            onWheel={(e) => e.preventDefault()}
            onTouchMove={(e) => e.preventDefault()}
            aria-label="Close form"
            disabled={saving}
          />

          <div className="users-modal__panel users-modal__panel--wide">
            <header className="users-modal__header">
              <div className="users-modal__titles">
                <h2 id="users-form-title">{isEdit ? 'Edit user' : 'Add new user'}</h2>
                <p>{isEdit ? 'Update account details, role and branch access' : 'Create a user account for inventory access'}</p>
              </div>
              <button
                type="button"
                className="users-modal__close"
                onClick={handleCloseForm}
                aria-label="Close"
                disabled={saving}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <form className="users-modal__form" onSubmit={handleSubmit}>
              <div className="users-modal__body">
              {formError && (
                <p className="form-banner-error" role="alert">{formError}</p>
              )}

              <label className={`users-field${fieldErrors.username ? ' field-invalid' : ''}`}>
                <span>
                  Username
                  <span className="users-field__required" aria-hidden="true">*</span>
                </span>
                <input
                  id="field-username"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value)
                    clearFieldError('username')
                  }}
                  placeholder="Enter username"
                  autoComplete="off"
                  disabled={saving}
                  aria-invalid={Boolean(fieldErrors.username)}
                  aria-describedby={fieldErrors.username ? 'field-error-username' : undefined}
                />
                <FieldError id="field-error-username" message={fieldErrors.username} />
              </label>

              <label className={`users-field${fieldErrors.password ? ' field-invalid' : ''}`}>
                <span>
                  Password
                  {!isEdit && <span className="users-field__required" aria-hidden="true">*</span>}
                </span>
                <div className="users-field__password">
                  <input
                    id="field-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      clearFieldError('password')
                    }}
                    placeholder="Enter password"
                    autoComplete="new-password"
                    disabled={saving}
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? 'field-error-password' : undefined}
                  />
                  <button
                    type="button"
                    className="users-field__toggle"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                    disabled={saving}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A10.8 10.8 0 0112 5c5 0 9.3 3.1 11 7.5a11.2 11.2 0 01-4.1 4.6M6.7 6.7A11.2 11.2 0 002 12.5C3.7 16.9 8 20 13 20c1.5 0 2.9-.3 4.2-.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M2 12.5C3.7 8.1 8 5 13 5s9.3 3.1 11 7.5c-1.7 4.4-6 7.5-11 7.5S3.7 16.9 2 12.5z" stroke="currentColor" strokeWidth="1.6" />
                        <circle cx="13" cy="12.5" r="3" stroke="currentColor" strokeWidth="1.6" />
                      </svg>
                    )}
                  </button>
                </div>
                {isEdit && (
                  <span className="users-field__hint">
                    Leave blank to keep the current password (min. 6 characters if changing)
                  </span>
                )}
                <FieldError id="field-error-password" message={fieldErrors.password} />
              </label>

              <label className={`users-field${fieldErrors.roleId ? ' field-invalid' : ''}`}>
                <span>
                  Role
                  <span className="users-field__required" aria-hidden="true">*</span>
                </span>
                <select
                  id="field-roleId"
                  value={roleId}
                  onChange={(e) => {
                    setRoleId(e.target.value)
                    clearFieldError('roleId')
                  }}
                  disabled={saving || optionsLoading}
                  aria-invalid={Boolean(fieldErrors.roleId)}
                  aria-describedby={fieldErrors.roleId ? 'field-error-roleId' : undefined}
                >
                  <option value="">Select role</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
                <FieldError id="field-error-roleId" message={fieldErrors.roleId} />
              </label>

              <div className={`users-field users-field--branches${fieldErrors.branches ? ' field-invalid' : ''}`}>
                <span>
                  Branches
                  {!isSuperAdmin && (
                    <span className="users-field__required" aria-hidden="true">*</span>
                  )}
                </span>
                {isSuperAdmin ? (
                  <p className="users-field__hint users-field__hint--info">
                    Super Admin users automatically have access to all branches.
                  </p>
                ) : (
                  <BranchMultiSelect
                    branches={formBranches}
                    selectedIds={selectedBranchIds}
                    onToggle={toggleBranch}
                    onSelectAll={handleSelectAllBranches}
                    onClearAll={() => setSelectedBranchIds([])}
                    disabled={saving}
                    loading={optionsLoading}
                  />
                )}
                <FieldError id="field-error-branches" message={fieldErrors.branches} />
              </div>
              </div>

              <footer className="users-modal__footer">
                <button
                  type="button"
                  className="users-btn users-btn--ghost"
                  onClick={handleCloseForm}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="users-btn users-btn--primary"
                  disabled={saving}
                >
                  {saving ? 'Saving…' : isEdit ? 'Update User' : 'Create User'}
                </button>
              </footer>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
