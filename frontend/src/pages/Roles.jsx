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
  products: 'Stock',
  batches: 'Batches',
  stock_verification: 'Reports',
  users: 'Users',
  roles: 'Roles',
  branches: 'Branches',
}

/** Matches app menu flow; admin modules (users, roles, branches) last. */
const PERMISSION_MODULE_ORDER = [
  'dashboard',
  'products',
  'batches',
  'stock_verification',
  'users',
  'roles',
  'branches',
]

const PERMISSION_ACTION_ORDER = [
  'view',
  'view_all',
  'import',
  'upload',
  'add',
  'update',
  'delete',
  'report',
  'export',
  'manage',
]

const ACTION_LABELS = {
  view: 'View',
  add: 'Create',
  update: 'Update',
  delete: 'Delete',
  import: 'Import',
  upload: 'Upload',
  report: 'Report',
  export: 'Export',
  manage: 'Manage',
  view_all: 'View all',
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
  if (permission.parentId) {
    return permission.description?.trim() || titleCase(permission.action)
  }

  if (permission.action) {
    return ACTION_LABELS[permission.action] || titleCase(permission.action)
  }

  const description = permission.description?.trim()
  if (description) {
    if (description.toLowerCase().startsWith('view all')) return 'View all'
    return description.split(/\s+/)[0]
  }

  return titleCase(permission.name?.split('.').pop())
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

function getModuleSortIndex(module) {
  const index = PERMISSION_MODULE_ORDER.indexOf(module)
  return index === -1 ? PERMISSION_MODULE_ORDER.length : index
}

function getActionSortIndex(action) {
  const index = PERMISSION_ACTION_ORDER.indexOf(action)
  return index === -1 ? PERMISSION_ACTION_ORDER.length : index
}

function getModuleSelection(modulePermissions, selectedIds) {
  const moduleIds = modulePermissions.map((permission) => permission.id)
  const selectedCount = moduleIds.filter((id) => selectedIds.includes(id)).length

  return {
    all: moduleIds.length > 0 && selectedCount === moduleIds.length,
    some: selectedCount > 0 && selectedCount < moduleIds.length,
    none: selectedCount === 0,
    selectedCount,
    total: moduleIds.length,
  }
}

function getOrderedPermissionGroups(permissions) {
  const groups = groupPermissionsByModule(permissions)

  return Object.entries(groups)
    .sort(([moduleA], [moduleB]) => getModuleSortIndex(moduleA) - getModuleSortIndex(moduleB))
    .map(([moduleName, modulePermissions]) => [
      moduleName,
      [...modulePermissions].sort((a, b) => {
        const actionDiff = getActionSortIndex(a.action) - getActionSortIndex(b.action)
        if (actionDiff !== 0) {
          return actionDiff
        }

        return (a.name || '').localeCompare(b.name || '')
      }),
    ])
}

function isDashboardGroupParent(permission) {
  return permission.module === 'dashboard'
    && permission.action === 'group'
    && !permission.parentId
}

function isDashboardChild(permission) {
  return permission.module === 'dashboard' && Boolean(permission.parentId)
}

function buildDashboardNestedGroup(permissions) {
  const directPermissions = permissions
    .filter((permission) => (
      permission.module === 'dashboard'
      && isAssignablePermission(permission)
      && !permission.parentId
    ))
    .sort((a, b) => getActionSortIndex(a.action) - getActionSortIndex(b.action))

  const sections = permissions
    .filter(isDashboardGroupParent)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((parent) => ({
      key: `dashboard-section-${parent.id}`,
      title: parent.description || titleCase(parent.name?.split('.').pop()),
      children: permissions
        .filter((permission) => (
          permission.parentId === parent.id
          && isAssignablePermission(permission)
        ))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .filter((section) => section.children.length > 0)

  const allPermissions = [
    ...directPermissions,
    ...sections.flatMap((section) => section.children),
  ]

  if (!allPermissions.length) {
    return null
  }

  return {
    key: 'module-dashboard',
    title: formatModuleName('dashboard'),
    nested: true,
    directPermissions,
    sections,
    permissions: allPermissions,
  }
}

function buildPermissionGroups(permissions) {
  const hasDashboardSections = permissions.some(isDashboardGroupParent)

  const groups = []

  if (hasDashboardSections) {
    const dashboardGroup = buildDashboardNestedGroup(permissions)
    if (dashboardGroup) {
      groups.push(dashboardGroup)
    }
  }

  const otherPermissions = permissions.filter((permission) => {
    if (hasDashboardSections && permission.module === 'dashboard') {
      return false
    }

    return !isDashboardGroupParent(permission) && !isDashboardChild(permission)
  })

  const otherGroups = getOrderedPermissionGroups(
    otherPermissions.filter(isAssignablePermission),
  ).map(([moduleName, modulePermissions]) => ({
    key: `module-${moduleName}`,
    title: formatModuleName(moduleName),
    nested: false,
    permissions: modulePermissions,
  }))

  return [...groups, ...otherGroups].filter((group) => group.permissions.length > 0)
}

function isAssignablePermission(permission) {
  return permission.action !== 'group'
}

function matchesPermissionSearch(text, term) {
  return String(text || '').toLowerCase().includes(term)
}

function permissionMatchesSearch(permission, term) {
  const haystack = [
    permission.name,
    permission.description,
    permission.module,
    permission.action,
    formatModuleName(permission.module),
    getPermissionLabel(permission),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(term)
}

function filterPermissionGroups(groups, searchInput) {
  const term = searchInput.trim().toLowerCase()
  if (!term) return groups

  const filtered = []

  for (const group of groups) {
    if (matchesPermissionSearch(group.title, term)) {
      filtered.push(group)
      continue
    }

    if (!group.nested) {
      const visiblePermissions = group.permissions.filter(
        (permission) => permissionMatchesSearch(permission, term),
      )

      if (visiblePermissions.length > 0) {
        filtered.push({
          ...group,
          permissions: visiblePermissions,
        })
      }
      continue
    }

    const directPermissions = (group.directPermissions || []).filter(
      (permission) => permissionMatchesSearch(permission, term),
    )

    const sections = []

    for (const section of group.sections || []) {
      if (matchesPermissionSearch(section.title, term)) {
        sections.push(section)
        continue
      }

      const children = section.children.filter(
        (permission) => permissionMatchesSearch(permission, term),
      )

      if (children.length > 0) {
        sections.push({
          ...section,
          children,
        })
      }
    }

    if (directPermissions.length > 0 || sections.length > 0) {
      const visiblePermissions = [
        ...directPermissions,
        ...sections.flatMap((section) => section.children),
      ]

      filtered.push({
        ...group,
        directPermissions,
        sections,
        permissions: visiblePermissions,
      })
    }
  }

  return filtered
}

function countVisiblePermissions(groups) {
  return groups.reduce((total, group) => total + group.permissions.length, 0)
}

function PermissionCheckboxRow({
  permission,
  checked,
  disabled,
  onToggle,
  className = '',
}) {
  return (
    <label className={`roles-permission${className ? ` ${className}` : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={disabled}
      />
      <span className="roles-permission__text">
        {getPermissionLabel(permission)}
      </span>
    </label>
  )
}

function PermissionGroupCheckboxHeader({
  title,
  selection,
  permissions,
  disabled,
  onToggle,
  className = 'roles-permissions__group-header',
  countClassName = 'roles-permissions__group-count',
}) {
  const shouldSelectAll = !selection.all

  return (
    <label className={className}>
      <input
        type="checkbox"
        className="roles-permissions__group-checkbox"
        checked={selection.all}
        ref={(input) => setGroupCheckboxState(input, selection.all, selection.some)}
        onChange={() => onToggle(permissions, shouldSelectAll)}
        disabled={disabled}
      />
      <span className="roles-permissions__group-name">{title}</span>
      <span className={countClassName}>
        {selection.selectedCount}
        /
        {selection.total}
      </span>
    </label>
  )
}

function setGroupCheckboxState(input, checked, indeterminate) {
  if (!input) return
  input.indeterminate = indeterminate
  input.checked = checked
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
  const [permissionSearchInput, setPermissionSearchInput] = useState('')

  const permissionGroups = useMemo(
    () => buildPermissionGroups(permissions),
    [permissions],
  )

  const filteredPermissionGroups = useMemo(
    () => filterPermissionGroups(permissionGroups, permissionSearchInput),
    [permissionGroups, permissionSearchInput],
  )

  const visiblePermissionCount = useMemo(
    () => countVisiblePermissions(filteredPermissionGroups),
    [filteredPermissionGroups],
  )

  const isPermissionSearchActive = permissionSearchInput.trim().length > 0

  const assignablePermissions = useMemo(
    () => permissions.filter(isAssignablePermission),
    [permissions],
  )

  const totalSelectedPermissions = form.permissionIds.length
  const totalPermissions = assignablePermissions.length
  const allPermissionsSelected = totalPermissions > 0
    && totalSelectedPermissions === totalPermissions

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [rolesData, permissionsData] = await Promise.all([
        fetchRoles(),
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
    setPermissionSearchInput('')
    setShowForm(false)
    resetFormErrors()
  }

  function handleAddClick() {
    setEditingId(null)
    setEditingIsSystem(false)
    setForm(EMPTY_FORM)
    setPermissionSearchInput('')
    setError('')
    resetFormErrors()
    setNotice('')
    setShowForm(true)
  }

  function handleEdit(role) {
    setEditingId(role.id)
    setEditingIsSystem(role.isSystem)
    setPermissionSearchInput('')
    setForm({
      name: role.name,
      description: role.description || '',
      permissionIds: role.permissions
        .filter(isAssignablePermission)
        .map((permission) => permission.id),
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

  function toggleModulePermissions(modulePermissions, selectAll) {
    const moduleIds = modulePermissions.map((permission) => permission.id)

    setForm((prev) => ({
      ...prev,
      permissionIds: selectAll
        ? [...new Set([...prev.permissionIds, ...moduleIds])]
        : prev.permissionIds.filter((id) => !moduleIds.includes(id)),
    }))
  }

  function toggleAllPermissions(selectAll) {
    setForm((prev) => ({
      ...prev,
      permissionIds: selectAll
        ? assignablePermissions.map((permission) => permission.id)
        : [],
    }))
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
      const assignableIds = new Set(assignablePermissions.map((permission) => permission.id))
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        permissionIds: form.permissionIds.filter((id) => assignableIds.has(id)),
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
                  <th>Si.No</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Updated</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filteredRoles.length === 0 && (
                  <tr>
                    <td colSpan={5} className="roles-table__empty">No roles found.</td>
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
                  <div className="roles-field__label-row">
                    <span className="roles-field__label">
                      Permissions
                      <span className="roles-field__optional">(optional)</span>
                    </span>
                    {permissions.length > 0 && (
                      <span className="roles-permissions__summary">
                        {totalSelectedPermissions}
                        {' '}
                        of
                        {' '}
                        {totalPermissions}
                        {' '}
                        selected
                      </span>
                    )}
                  </div>

                  {permissions.length === 0 ? (
                    <p className="roles-field__hint">No permissions available.</p>
                  ) : (
                    <div className="roles-permissions">
                      <div className="roles-permissions__search">
                        <span className="roles-search__icon" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </span>
                        <input
                          type="search"
                          value={permissionSearchInput}
                          onChange={(e) => setPermissionSearchInput(e.target.value)}
                          placeholder="Search permissions by module, section, or action…"
                          aria-label="Search permissions"
                          disabled={saving}
                        />
                        {isPermissionSearchActive && (
                          <button
                            type="button"
                            className="roles-permissions__search-clear"
                            onClick={() => setPermissionSearchInput('')}
                            disabled={saving}
                            aria-label="Clear permission search"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      <div className="roles-permissions__toolbar">
                        <span className="roles-permissions__toolbar-hint">
                          {isPermissionSearchActive
                            ? `${visiblePermissionCount.toLocaleString('en-IN')} permission${visiblePermissionCount === 1 ? '' : 's'} found`
                            : 'Select a module, section, or individual actions'}
                        </span>
                        <div className="roles-permissions__toolbar-actions">
                          <button
                            type="button"
                            className="roles-permissions__toolbar-btn"
                            onClick={() => toggleAllPermissions(true)}
                            disabled={saving || allPermissionsSelected}
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            className="roles-permissions__toolbar-btn"
                            onClick={() => toggleAllPermissions(false)}
                            disabled={saving || totalSelectedPermissions === 0}
                          >
                            Clear all
                          </button>
                        </div>
                      </div>

                      {filteredPermissionGroups.length === 0 ? (
                        <p className="roles-permissions__empty-search">
                          No permissions match
                          {' '}
                          <strong>{permissionSearchInput.trim()}</strong>
                          .
                        </p>
                      ) : (
                      filteredPermissionGroups.map((group) => {
                        const selection = getModuleSelection(
                          group.permissions,
                          form.permissionIds,
                        )

                        return (
                          <section
                            key={group.key}
                            className={`roles-permissions__group${
                              selection.selectedCount > 0 ? ' roles-permissions__group--selected' : ''
                            }${group.nested ? ' roles-permissions__group--nested' : ''}`}
                          >
                            <PermissionGroupCheckboxHeader
                              title={group.title}
                              selection={selection}
                              permissions={group.permissions}
                              disabled={saving}
                              onToggle={toggleModulePermissions}
                            />

                            {group.nested ? (
                              <div className="roles-permissions__nested">
                                {group.directPermissions?.length > 0 && (
                                  <div className="roles-permissions__list roles-permissions__list--child">
                                    {group.directPermissions.map((permission) => (
                                      <PermissionCheckboxRow
                                        key={permission.id}
                                        permission={permission}
                                        checked={form.permissionIds.includes(permission.id)}
                                        disabled={saving}
                                        onToggle={() => togglePermission(permission.id)}
                                      />
                                    ))}
                                  </div>
                                )}

                                {group.sections?.map((section) => {
                                  const sectionSelection = getModuleSelection(
                                    section.children,
                                    form.permissionIds,
                                  )

                                  return (
                                    <div
                                      key={section.key}
                                      className={`roles-permissions__subsection${
                                        sectionSelection.selectedCount > 0
                                          ? ' roles-permissions__subsection--selected'
                                          : ''
                                      }`}
                                    >
                                      <PermissionGroupCheckboxHeader
                                        title={section.title}
                                        selection={sectionSelection}
                                        permissions={section.children}
                                        disabled={saving}
                                        onToggle={toggleModulePermissions}
                                        className="roles-permissions__subsection-header"
                                        countClassName="roles-permissions__subsection-count"
                                      />

                                      <div className="roles-permissions__list roles-permissions__list--subchild">
                                        {section.children.map((permission) => (
                                          <PermissionCheckboxRow
                                            key={permission.id}
                                            permission={permission}
                                            checked={form.permissionIds.includes(permission.id)}
                                            disabled={saving}
                                            onToggle={() => togglePermission(permission.id)}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <div className="roles-permissions__list">
                                {group.permissions.map((permission) => (
                                  <PermissionCheckboxRow
                                    key={permission.id}
                                    permission={permission}
                                    checked={form.permissionIds.includes(permission.id)}
                                    disabled={saving}
                                    onToggle={() => togglePermission(permission.id)}
                                  />
                                ))}
                              </div>
                            )}
                          </section>
                        )
                      })
                      )}
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
