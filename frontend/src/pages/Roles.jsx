import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import TablePagination from '../components/TablePagination.jsx'
import FieldError from '../components/FieldError.jsx'
import {
  createRole,
  deleteRole,
  fetchPermissions,
  fetchRoles,
  updateRole,
} from '../services/roles.js'
import '../components/FieldError.css'
import { mapRoleSaveError, scrollToFirstFieldError } from '../utils/formValidation.js'
import './Roles.css'

const DEFAULT_PAGE_SIZE = 10

const EMPTY_FORM = {
  name: '',
  description: '',
  permissionIds: [],
}

const MODULE_LABELS = {
  dashboard: 'Dashboard',
  products: 'Products',
  batches: 'Batches',
  stock_verification: 'Stock verification',
  users: 'Users',
  branches: 'Branches',
  roles: 'Roles',
}

const ACTION_LABELS = {
  view: 'View',
  add: 'Create',
  update: 'Update',
  delete: 'Delete',
  import: 'Import',
  upload: 'Upload',
  report: 'View reports',
  export: 'Export',
  manage: 'Manage',
  view_all: 'View all branches',
}

function titleCase(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatModuleName(module) {
  return MODULE_LABELS[module] || titleCase(module) || 'Other'
}

function getPermissionLabel(permission) {
  if (permission.description?.trim()) {
    return permission.description.trim()
  }

  const action = ACTION_LABELS[permission.action] || titleCase(permission.action)
  const module = formatModuleName(permission.module)
  return `${action} ${module}`.trim()
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

function groupPermissionsByModule(permissions) {
  return permissions.reduce((groups, permission) => {
    const moduleName = permission.module || 'Other'
    if (!groups[moduleName]) {
      groups[moduleName] = []
    }
    groups[moduleName].push(permission)
    return groups
  }, {})
}

export default function Roles() {
  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [editingIsSystem, setEditingIsSystem] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')

  const permissionGroups = useMemo(
    () => groupPermissionsByModule(permissions),
    [permissions],
  )

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [rolesData, permissionsData] = await Promise.all([
        fetchRoles({ includeInactive: true }),
        fetchPermissions(),
      ])
      setRoles(rolesData)
      setPermissions(permissionsData)
    } catch (err) {
      setError(err.message || 'Failed to load roles.')
      setRoles([])
      setPermissions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!showForm) return undefined

    const pageContent = document.querySelector('.page-content')
    document.body.classList.add('roles-modal-open')
    document.documentElement.classList.add('roles-modal-open')

    const prevPageOverflow = pageContent?.style.overflow
    if (pageContent) {
      pageContent.style.overflow = 'hidden'
    }

    return () => {
      document.body.classList.remove('roles-modal-open')
      document.documentElement.classList.remove('roles-modal-open')
      if (pageContent) {
        pageContent.style.overflow = prevPageOverflow || ''
      }
    }
  }, [showForm])

  const filteredRoles = useMemo(() => {
    const term = searchInput.trim().toLowerCase()
    if (!term) return roles
    return roles.filter((role) => {
      const haystack = [
        role.name,
        role.description,
        ...role.permissions.flatMap((permission) => [
          permission.name,
          permission.description,
          getPermissionLabel(permission),
        ]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(term)
    })
  }, [roles, searchInput])

  const totalPages = Math.max(1, Math.ceil(filteredRoles.length / pageSize))

  const paginatedRoles = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRoles.slice(start, start + pageSize)
  }, [filteredRoles, page, pageSize])

  useEffect(() => {
    setPage(1)
  }, [searchInput, pageSize])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

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
    setForm(EMPTY_FORM)
    setEditingId(null)
    setEditingIsSystem(false)
    setShowForm(false)
    resetFormErrors()
  }

  function handleAddClick() {
    setEditingId(null)
    setEditingIsSystem(false)
    setForm(EMPTY_FORM)
    setError('')
    resetFormErrors()
    setNotice('')
    setShowForm(true)
  }

  function handleEdit(role) {
    setEditingId(role.id)
    setEditingIsSystem(role.isSystem)
    setForm({
      name: role.name,
      description: role.description || '',
      permissionIds: role.permissions.map((permission) => permission.id),
    })
    setError('')
    resetFormErrors()
    setNotice('')
    setShowForm(true)
  }

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
    clearFieldError(key)
  }

  function togglePermission(permissionId) {
    setForm((prev) => {
      const hasPermission = prev.permissionIds.includes(permissionId)
      return {
        ...prev,
        permissionIds: hasPermission
          ? prev.permissionIds.filter((id) => id !== permissionId)
          : [...prev.permissionIds, permissionId],
      }
    })
  }

  function validateForm() {
    const errors = {}

    if (!form.name.trim()) {
      errors.name = 'Role name is required.'
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

    setSaving(true)

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        permissionIds: form.permissionIds,
      }

      const isEdit = Boolean(editingId)

      if (isEdit) {
        await updateRole(editingId, payload)
      } else {
        await createRole(payload)
      }

      await loadData()
      resetForm()
      setNotice(isEdit ? 'Role updated successfully.' : 'Role created successfully.')
    } catch (err) {
      const mapped = mapRoleSaveError(err.message)
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

  async function handleDelete(role) {
    if (role.isSystem) return
    if (!window.confirm(`Delete role "${role.name}"?`)) return

    setDeletingId(role.id)
    setError('')
    setNotice('')

    try {
      await deleteRole(role.id)

      if (editingId === role.id) {
        resetForm()
      }

      setNotice('Role deleted successfully.')
      await loadData()
    } catch (err) {
      setError(err.message || 'Failed to delete role.')
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
    <div className={`roles-page${showForm ? ' roles-page--modal-open' : ''}`}>
      <section className="roles-list-card">
        <div className="roles-list__toolbar">
          <div className="roles-search">
            <span className="roles-search__icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search role or permission…"
              aria-label="Search roles"
            />
          </div>

          <div className="roles-list__actions">
            <span className="roles-list__count">
              {filteredRoles.length.toLocaleString('en-IN')} role{filteredRoles.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className="roles-btn roles-btn--primary roles-btn--add"
              onClick={handleAddClick}
              aria-label="Add role"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="roles-btn__label">Add Role</span>
            </button>
          </div>
        </div>

        {notice && !showForm && (
          <p className="roles-alert roles-alert--success roles-list__notice" role="status">{notice}</p>
        )}

        {error && !showForm && (
          <p className="roles-alert roles-alert--error roles-list__notice" role="alert">{error}</p>
        )}

        <div className="roles-list__body">
          <div className="roles-table-scroll">
            {loading ? (
              <div className="roles-loading" role="status" aria-live="polite" aria-label="Loading roles">
                <div className="roles-loading__spinner" aria-hidden="true">
                  <span className="roles-loading__ring" />
                </div>
                <p className="roles-loading__text">Loading roles…</p>
              </div>
            ) : (
            <table className="roles-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Permissions</th>
                  <th>Updated</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filteredRoles.length === 0 && (
                  <tr>
                    <td colSpan={6} className="roles-table__empty">No roles found.</td>
                  </tr>
                )}

                {paginatedRoles.map((role, index) => (
                  <tr key={role.id} className={editingId === role.id ? 'roles-table__row--active' : ''}>
                    <td>{(page - 1) * pageSize + index + 1}</td>
                    <td>
                      <div className="roles-table__name">
                        <span>{role.name}</span>
                        {role.isSystem && (
                          <span className="roles-table__badge">System</span>
                        )}
                      </div>
                    </td>
                    <td>{role.description || '—'}</td>
                    <td>{role.permissions.length}</td>
                    <td>{formatDate(role.updatedAt)}</td>
                    <td>
                      <div className="roles-table__actions">
                        <button
                          type="button"
                          className="roles-btn roles-btn--ghost roles-btn--sm"
                          onClick={() => handleEdit(role)}
                          disabled={saving || deletingId === role.id}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="roles-btn roles-btn--danger roles-btn--sm"
                          onClick={() => handleDelete(role)}
                          disabled={saving || deletingId === role.id || role.isSystem}
                          title={role.isSystem ? 'System roles cannot be deleted' : undefined}
                        >
                          {deletingId === role.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>

          {!loading && filteredRoles.length > 0 && (
            <TablePagination
              className="roles-table-pagination"
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              totalRecords={filteredRoles.length}
              rowCount={paginatedRoles.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={loading || saving || Boolean(deletingId)}
            />
          )}
        </div>
      </section>

      {showForm && createPortal(
        <div
          className="roles-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="roles-form-title"
        >
          <button
            type="button"
            className="roles-modal__backdrop"
            onClick={handleCloseForm}
            onWheel={(e) => e.preventDefault()}
            onTouchMove={(e) => e.preventDefault()}
            aria-label="Close form"
            disabled={saving}
          />

          <div className="roles-modal__panel roles-modal__panel--wide">
            <header className="roles-modal__header">
              <div className="roles-modal__titles">
                <h2 id="roles-form-title">{isEdit ? 'Edit role' : 'Add new role'}</h2>
                <p>{isEdit ? 'Update role details and permissions' : 'Create a role and assign permissions'}</p>
              </div>
              <button
                type="button"
                className="roles-modal__close"
                onClick={handleCloseForm}
                aria-label="Close"
                disabled={saving}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <form className="roles-modal__form" onSubmit={handleSubmit}>
              <div className="roles-modal__body">
                {formError && (
                  <p className="form-banner-error" role="alert">{formError}</p>
                )}

                <label className={`roles-field${fieldErrors.name ? ' field-invalid' : ''}`}>
                  <span className="roles-field__label">
                    Role name
                    <span className="roles-field__required" aria-hidden="true">*</span>
                  </span>
                  <input
                    id="field-name"
                    type="text"
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="Enter role name"
                    autoComplete="off"
                    disabled={saving}
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? 'field-error-name' : undefined}
                  />
                  <FieldError id="field-error-name" message={fieldErrors.name} />
                </label>

                <label className="roles-field">
                  <span className="roles-field__label">
                    Description
                    <span className="roles-field__optional">(optional)</span>
                  </span>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Short description"
                    autoComplete="off"
                    disabled={saving}
                  />
                </label>

                {editingIsSystem && (
                  <p className="roles-field__hint roles-field__hint--system">
                    This is a system role. You can update permissions, but it cannot be deleted.
                  </p>
                )}

                <div className="roles-field">
                  <span className="roles-field__label">
                    Permissions
                    <span className="roles-field__optional">(optional)</span>
                  </span>

                  {permissions.length === 0 ? (
                    <p className="roles-field__hint">No permissions available.</p>
                  ) : (
                    <div className="roles-permissions">
                      {Object.entries(permissionGroups)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([moduleName, modulePermissions]) => (
                        <section key={moduleName} className="roles-permissions__group">
                          <h3 className="roles-permissions__group-title">{formatModuleName(moduleName)}</h3>
                          <div className="roles-permissions__list">
                            {modulePermissions.map((permission) => (
                              <label key={permission.id} className="roles-permission">
                                <input
                                  type="checkbox"
                                  checked={form.permissionIds.includes(permission.id)}
                                  onChange={() => togglePermission(permission.id)}
                                  disabled={saving}
                                />
                                <span className="roles-permission__text">
                                  <strong>{getPermissionLabel(permission)}</strong>
                                </span>
                              </label>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <footer className="roles-modal__footer">
                <button
                  type="button"
                  className="roles-btn roles-btn--ghost"
                  onClick={handleCloseForm}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="roles-btn roles-btn--primary"
                  disabled={saving}
                >
                  {saving ? 'Saving…' : isEdit ? 'Update Role' : 'Create Role'}
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
