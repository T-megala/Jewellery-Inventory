import { useCallback, useEffect, useMemo, useState } from 'react'
import BackToMastersLink from '../components/BackToMastersLink.jsx'
import { createPortal } from 'react-dom'
import TablePagination from '../components/TablePagination.jsx'
import FieldError from '../components/FieldError.jsx'
import {
  createBranch,
  deleteBranch,
  fetchBranches,
  updateBranch,
} from '../services/branches.js'
import { hasPermission } from '../services/auth.js'
import '../components/FieldError.css'
import { mapBranchSaveError, scrollToFirstFieldError } from '../utils/formValidation.js'
import './Branches.css'

const DEFAULT_PAGE_SIZE = 10

const EMPTY_FORM = {
  name: '',
  address: '',
  city: '',
  phone: '',
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

export default function Branches() {
  const canDelete = hasPermission('branches.delete')
  const [branches, setBranches] = useState([])
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')

  const loadBranches = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const data = await fetchBranches()
      setBranches(data)
    } catch (err) {
      setError(err.message || 'Failed to load branches.')
      setBranches([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBranches()
  }, [loadBranches])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!showForm) return undefined

    const pageContent = document.querySelector('.page-content')
    document.body.classList.add('branches-modal-open')
    document.documentElement.classList.add('branches-modal-open')

    const prevPageOverflow = pageContent?.style.overflow
    if (pageContent) {
      pageContent.style.overflow = 'hidden'
    }

    return () => {
      document.body.classList.remove('branches-modal-open')
      document.documentElement.classList.remove('branches-modal-open')
      if (pageContent) {
        pageContent.style.overflow = prevPageOverflow || ''
      }
    }
  }, [showForm])

  const filteredBranches = useMemo(() => {
    const term = searchInput.trim().toLowerCase()
    if (!term) return branches
    return branches.filter((branch) => {
      const haystack = [branch.name, branch.city, branch.phone, branch.address]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(term)
    })
  }, [branches, searchInput])

  const totalPages = Math.max(1, Math.ceil(filteredBranches.length / pageSize))

  const paginatedBranches = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredBranches.slice(start, start + pageSize)
  }, [filteredBranches, page, pageSize])

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
    setShowForm(false)
    resetFormErrors()
  }

  function handleAddClick() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
    resetFormErrors()
    setNotice('')
    setShowForm(true)
  }

  function handleEdit(branch) {
    setEditingId(branch.id)
    setForm({
      name: branch.name,
      address: branch.address || '',
      city: branch.city || '',
      phone: branch.phone || '',
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

  function validateForm() {
    const errors = {}

    if (!form.name.trim()) {
      errors.name = 'Branch name is required.'
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
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        phone: form.phone.trim() || null,
      }

      const isEdit = Boolean(editingId)

      if (isEdit) {
        await updateBranch(editingId, payload)
      } else {
        await createBranch(payload)
      }

      await loadBranches()
      resetForm()
      setNotice(isEdit ? 'Branch updated successfully.' : 'Branch created successfully.')
    } catch (err) {
      const mapped = mapBranchSaveError(err.message)
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

  async function handleDelete(branch) {
    if (!canDelete) return
    if (!window.confirm(`Delete branch "${branch.name}"?`)) return

    setDeletingId(branch.id)
    setError('')
    setNotice('')

    try {
      await deleteBranch(branch.id)

      if (editingId === branch.id) {
        resetForm()
      }

      setNotice('Branch deleted successfully.')
      await loadBranches()
    } catch (err) {
      setError(err.message || 'Failed to delete branch.')
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
    <div className={`branches-page${showForm ? ' branches-page--modal-open' : ''}`}>
      <BackToMastersLink />
      <section className="branches-list-card">
        <div className="branches-list__toolbar">
          <div className="branches-search">
            <span className="branches-search__icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, city or phone…"
              aria-label="Search branches"
            />
          </div>

          <div className="branches-list__actions">
            <span className="branches-list__count">
              {filteredBranches.length.toLocaleString('en-IN')} branch{filteredBranches.length === 1 ? '' : 'es'}
            </span>
            <button
              type="button"
              className="branches-btn branches-btn--primary branches-btn--add"
              onClick={handleAddClick}
              aria-label="Add branch"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="branches-btn__label">Add Branch</span>
            </button>
          </div>
        </div>

        {notice && !showForm && (
          <p className="branches-alert branches-alert--success branches-list__notice" role="status">{notice}</p>
        )}

        {error && !showForm && (
          <p className="branches-alert branches-alert--error branches-list__notice" role="alert">{error}</p>
        )}

        <div className="branches-list__body">
          <div className="branches-table-scroll">
            {loading ? (
              <div className="branches-loading" role="status" aria-live="polite" aria-label="Loading branches">
                <div className="branches-loading__spinner" aria-hidden="true">
                  <span className="branches-loading__ring" />
                </div>
                <p className="branches-loading__text">Loading branches…</p>
              </div>
            ) : (
            <table className="branches-table">
              <thead>
                <tr>
                  <th>Si.No</th>
                  <th>Name</th>
                  <th>City</th>
                  <th>Phone</th>
                  <th>Updated</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filteredBranches.length === 0 && (
                  <tr>
                    <td colSpan={6} className="branches-table__empty">No branches found.</td>
                  </tr>
                )}

                {paginatedBranches.map((branch, index) => (
                  <tr key={branch.id} className={editingId === branch.id ? 'branches-table__row--active' : ''}>
                    <td>{(page - 1) * pageSize + index + 1}</td>
                    <td>{branch.name}</td>
                    <td>{branch.city || '—'}</td>
                    <td>{branch.phone || '—'}</td>
                    <td>{formatDate(branch.updatedAt)}</td>
                    <td>
                      <div className="branches-table__actions">
                        <button
                          type="button"
                          className="branches-btn branches-btn--ghost branches-btn--sm"
                          onClick={() => handleEdit(branch)}
                          disabled={saving || deletingId === branch.id}
                        >
                          Edit
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            className="branches-btn branches-btn--danger branches-btn--sm"
                            onClick={() => handleDelete(branch)}
                            disabled={saving || deletingId === branch.id}
                          >
                            {deletingId === branch.id ? 'Deleting…' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>

          {!loading && filteredBranches.length > 0 && (
            <TablePagination
              className="branches-table-pagination"
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              totalRecords={filteredBranches.length}
              rowCount={paginatedBranches.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={loading || saving || Boolean(deletingId)}
            />
          )}
        </div>
      </section>

      {showForm && createPortal(
        <div
          className="branches-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="branches-form-title"
        >
          <button
            type="button"
            className="branches-modal__backdrop"
            onClick={handleCloseForm}
            onWheel={(e) => e.preventDefault()}
            onTouchMove={(e) => e.preventDefault()}
            aria-label="Close form"
            disabled={saving}
          />

          <div className="branches-modal__panel">
            <header className="branches-modal__header">
              <div className="branches-modal__titles">
                <h2 id="branches-form-title">{isEdit ? 'Edit branch' : 'Add new branch'}</h2>
                <p>{isEdit ? 'Update branch details' : 'Create a showroom or branch location'}</p>
              </div>
              <button
                type="button"
                className="branches-modal__close"
                onClick={handleCloseForm}
                aria-label="Close"
                disabled={saving}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <form className="branches-modal__form" onSubmit={handleSubmit}>
              <div className="branches-modal__body">
                {formError && (
                  <p className="form-banner-error" role="alert">{formError}</p>
                )}

                <label className={`branches-field${fieldErrors.name ? ' field-invalid' : ''}`}>
                  <span className="branches-field__label">
                    Branch name
                    <span className="branches-field__required" aria-hidden="true">*</span>
                  </span>
                  <input
                    id="field-name"
                    type="text"
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="Enter branch name"
                    autoComplete="off"
                    disabled={saving}
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? 'field-error-name' : undefined}
                  />
                  <FieldError id="field-error-name" message={fieldErrors.name} />
                </label>

                <label className="branches-field">
                  <span className="branches-field__label">
                    Address
                    <span className="branches-field__optional">(optional)</span>
                  </span>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => updateField('address', e.target.value)}
                    placeholder="Street address"
                    autoComplete="off"
                    disabled={saving}
                  />
                </label>

                <div className="branches-form-row">
                  <label className="branches-field">
                    <span className="branches-field__label">
                      City
                      <span className="branches-field__optional">(optional)</span>
                    </span>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => updateField('city', e.target.value)}
                      placeholder="City"
                      autoComplete="off"
                      disabled={saving}
                    />
                  </label>

                  <label className="branches-field">
                    <span className="branches-field__label">
                      Phone
                      <span className="branches-field__optional">(optional)</span>
                    </span>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => updateField('phone', e.target.value)}
                      placeholder="Contact number"
                      autoComplete="off"
                      disabled={saving}
                    />
                  </label>
                </div>
              </div>

              <footer className="branches-modal__footer">
                <button
                  type="button"
                  className="branches-btn branches-btn--ghost"
                  onClick={handleCloseForm}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="branches-btn branches-btn--primary"
                  disabled={saving}
                >
                  {saving ? 'Saving…' : isEdit ? 'Update Branch' : 'Create Branch'}
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
