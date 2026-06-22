import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import TablePagination from '../components/TablePagination.jsx'
import {
  createUser,
  deleteUser,
  fetchUsers,
  updateUser,
} from '../services/users.js'
import './Users.css'

const DEFAULT_PAGE_SIZE = 10

const EMPTY_FIELD_ERRORS = { username: '', password: '' }

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

export default function Users() {
  const [users, setUsers] = useState([])
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [userToDelete, setUserToDelete] = useState(null)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState(EMPTY_FIELD_ERRORS)
  const [notice, setNotice] = useState('')

  const passwordRef = useRef(null)
  const submitRef = useRef(null)
  const formRef = useRef(null)
  const deleteCancelRef = useRef(null)
  const deleteConfirmRef = useRef(null)

  const isModalOpen = showForm || Boolean(userToDelete)

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

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!isModalOpen) return undefined

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
  }, [isModalOpen])

  useEffect(() => {
    if (!userToDelete) return undefined

    const timer = window.setTimeout(() => deleteCancelRef.current?.focus(), 0)

    function handleEscape(e) {
      if (e.key === 'Escape' && !deletingId) {
        setUserToDelete(null)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [userToDelete, deletingId])

  const filteredUsers = useMemo(() => {
    const term = searchInput.trim().toLowerCase()
    if (!term) return users
    return users.filter((user) => user.username.toLowerCase().includes(term))
  }, [users, searchInput])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize))

  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredUsers.slice(start, start + pageSize)
  }, [filteredUsers, page, pageSize])

  useEffect(() => {
    setPage(1)
  }, [searchInput, pageSize])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  function resetForm() {
    setUsername('')
    setPassword('')
    setShowPassword(false)
    setEditingId(null)
    setShowForm(false)
    setFieldErrors(EMPTY_FIELD_ERRORS)
  }

  function handleAddClick() {
    setEditingId(null)
    setUsername('')
    setPassword('')
    setShowPassword(false)
    setError('')
    setFieldErrors(EMPTY_FIELD_ERRORS)
    setNotice('')
    setShowForm(true)
  }

  function handleEdit(user) {
    setEditingId(user.id)
    setUsername(user.username)
    setPassword('')
    setShowPassword(false)
    setError('')
    setFieldErrors(EMPTY_FIELD_ERRORS)
    setNotice('')
    setShowForm(true)
  }

  function validateForm() {
    const trimmedUsername = username.trim()
    const errors = { ...EMPTY_FIELD_ERRORS }

    if (!trimmedUsername) {
      errors.username = 'Please enter a username.'
    }

    if (!editingId && !password) {
      errors.password = 'Please enter a password.'
    } else if (password && password.length < 6) {
      errors.password = 'Password must be at least 6 characters.'
    }

    setFieldErrors(errors)
    return !errors.username && !errors.password
  }

  function clearFieldError(field) {
    setFieldErrors((current) => (
      current[field] ? { ...current, [field]: '' } : current
    ))
  }

  function handleUsernameKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      passwordRef.current?.focus()
    }
  }

  function handlePasswordKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitRef.current?.focus()
      formRef.current?.requestSubmit()
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setFieldErrors(EMPTY_FIELD_ERRORS)
    setNotice('')

    if (!validateForm()) return

    setSaving(true)

    try {
      const trimmedUsername = username.trim()
      const isEdit = Boolean(editingId)

      if (isEdit) {
        const payload = { username: trimmedUsername }
        if (password) {
          payload.password = password
        }
        await updateUser(editingId, payload)
      } else {
        await createUser({
          username: trimmedUsername,
          password,
        })
      }

      await loadUsers()
      resetForm()
      setNotice(isEdit ? 'User updated successfully.' : 'User created successfully.')
    } catch (err) {
      setError(err.message || 'Failed to save user.')
    } finally {
      setSaving(false)
    }
  }

  function handleDeleteClick(user) {
    setUserToDelete(user)
    setError('')
    setNotice('')
  }

  function handleCloseDeleteConfirm() {
    if (deletingId) return
    setUserToDelete(null)
  }

  function handleDeleteCancelKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      deleteConfirmRef.current?.focus()
    }
  }

  function handleDeleteConfirmKeyDown(e) {
    if (e.key === 'Enter' && !deletingId) {
      e.preventDefault()
      handleConfirmDelete()
    }
  }

  async function handleConfirmDelete() {
    if (!userToDelete || deletingId) return

    setDeletingId(userToDelete.id)
    setError('')
    setNotice('')

    try {
      await deleteUser(userToDelete.id)

      if (editingId === userToDelete.id) {
        resetForm()
      }

      setUserToDelete(null)
      setNotice('User deleted successfully.')
      await loadUsers()
    } catch (err) {
      setError(err.message || 'Failed to delete user.')
      setUserToDelete(null)
    } finally {
      setDeletingId(null)
    }
  }

  function handleCloseForm() {
    if (saving) return
    resetForm()
    setError('')
    setFieldErrors(EMPTY_FIELD_ERRORS)
    setNotice('')
  }

  const isEdit = Boolean(editingId)

  return (
    <div className={`users-page${isModalOpen ? ' users-page--modal-open' : ''}`}>
      <section className="users-list-card">
        <div className="users-list__toolbar">
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
              placeholder="Search username…"
              aria-label="Search users"
            />
          </div>

          <div className="users-list__actions">
            <span className="users-list__count">
              {filteredUsers.length.toLocaleString('en-IN')} user{filteredUsers.length === 1 ? '' : 's'}
            </span>
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
          </div>
        </div>

        {notice && !isModalOpen && (
          <p className="users-alert users-alert--success users-list__notice" role="status">{notice}</p>
        )}

        {error && !isModalOpen && (
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
                  <th>#</th>
                  <th>Username</th>
                  <th>Created</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="users-table__empty">No users found.</td>
                  </tr>
                )}

                {paginatedUsers.map((user, index) => (
                  <tr key={user.id} className={editingId === user.id ? 'users-table__row--active' : ''}>
                    <td>{(page - 1) * pageSize + index + 1}</td>
                    <td>{user.username}</td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>
                      <div className="users-table__actions">
                        <button
                          type="button"
                          className="users-btn users-btn--ghost users-btn--sm"
                          onClick={() => handleEdit(user)}
                          disabled={saving || Boolean(deletingId) || Boolean(userToDelete)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="users-btn users-btn--danger users-btn--sm"
                          onClick={() => handleDeleteClick(user)}
                          disabled={saving || Boolean(deletingId) || Boolean(userToDelete)}
                        >
                          {deletingId === user.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </td>
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
              disabled={loading || saving || Boolean(deletingId) || Boolean(userToDelete)}
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

          <div className="users-modal__panel">
            <header className="users-modal__header">
              <div className="users-modal__titles">
                <h2 id="users-form-title">{isEdit ? 'Edit user' : 'Add new user'}</h2>
                <p>{isEdit ? 'Update username or password' : 'Create a user account for inventory access'}</p>
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

            <form ref={formRef} className="users-modal__form" onSubmit={handleSubmit} noValidate>
              <label className={`users-field${fieldErrors.username ? ' users-field--invalid' : ''}`}>
                <span>
                  Username
                  <span className="users-field__required" aria-hidden="true">*</span>
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value)
                    clearFieldError('username')
                  }}
                  onKeyDown={handleUsernameKeyDown}
                  placeholder="Enter username"
                  autoComplete="off"
                  disabled={saving}
                  aria-invalid={Boolean(fieldErrors.username)}
                  aria-describedby={fieldErrors.username ? 'users-username-error' : undefined}
                />
                {fieldErrors.username && (
                  <p id="users-username-error" className="users-field__error" role="alert">
                    {fieldErrors.username}
                  </p>
                )}
              </label>

              <label className={`users-field${fieldErrors.password ? ' users-field--invalid' : ''}`}>
                <span>
                  Password
                  {!isEdit && <span className="users-field__required" aria-hidden="true">*</span>}
                </span>
                <div className="users-field__password">
                  <input
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      clearFieldError('password')
                    }}
                    onKeyDown={handlePasswordKeyDown}
                    placeholder="Enter password"
                    autoComplete="new-password"
                    disabled={saving}
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={
                      fieldErrors.password
                        ? 'users-password-error'
                        : isEdit
                          ? 'users-password-hint'
                          : undefined
                    }
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
                {fieldErrors.password && (
                  <p id="users-password-error" className="users-field__error" role="alert">
                    {fieldErrors.password}
                  </p>
                )}
                {isEdit && (
                  <span id="users-password-hint" className="users-field__hint">
                    Leave blank to keep the current password (min. 6 characters if changing)
                  </span>
                )}
              </label>

              {error && (
                <p className="users-alert users-alert--error" role="alert">{error}</p>
              )}

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
                  ref={submitRef}
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

      {userToDelete && createPortal(
        <div
          className="users-modal"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="users-delete-title"
          aria-describedby="users-delete-message"
        >
          <button
            type="button"
            className="users-modal__backdrop"
            onClick={handleCloseDeleteConfirm}
            onWheel={(e) => e.preventDefault()}
            onTouchMove={(e) => e.preventDefault()}
            aria-label="Close delete confirmation"
            disabled={Boolean(deletingId)}
          />

          <div className="users-modal__panel users-modal__panel--confirm">
            <header className="users-modal__header">
              <div className="users-modal__titles">
                <h2 id="users-delete-title">Delete user</h2>
                <p>This action cannot be undone</p>
              </div>
              <button
                type="button"
                className="users-modal__close"
                onClick={handleCloseDeleteConfirm}
                aria-label="Close"
                disabled={Boolean(deletingId)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <div className="users-confirm__body">
              <p id="users-delete-message" className="users-confirm__message">
                Are you sure you want to delete user{' '}
                <span className="users-confirm__username">&quot;{userToDelete.username}&quot;</span>?
              </p>
            </div>

            <footer className="users-modal__footer">
              <button
                ref={deleteCancelRef}
                type="button"
                className="users-btn users-btn--ghost"
                onClick={handleCloseDeleteConfirm}
                onKeyDown={handleDeleteCancelKeyDown}
                disabled={Boolean(deletingId)}
              >
                Cancel
              </button>
              <button
                ref={deleteConfirmRef}
                type="button"
                className="users-btn users-btn--danger-solid"
                onClick={handleConfirmDelete}
                onKeyDown={handleDeleteConfirmKeyDown}
                disabled={Boolean(deletingId)}
              >
                {deletingId ? 'Deleting…' : 'Delete'}
              </button>
            </footer>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
