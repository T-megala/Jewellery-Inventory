import { useEffect, useMemo, useRef, useState } from 'react'
import './LoginBranchSelect.css'

function matchesSearch(branch, term) {
  if (!term) return true
  return branch.name.toLowerCase().includes(term)
}

export default function LoginBranchSelect({
  branches,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  disabled = false,
  emptyMessage = 'No branches are assigned to your account.',
}) {
  const [open, setOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')

  const rootRef = useRef(null)
  const searchRef = useRef(null)
  const searchTerm = searchInput.trim().toLowerCase()

  const filteredBranches = useMemo(
    () => branches.filter((branch) => matchesSearch(branch, searchTerm)),
    [branches, searchTerm],
  )

  const selectedBranches = useMemo(
    () => branches.filter((branch) => selectedIds.includes(branch.id)),
    [branches, selectedIds],
  )

  const allVisibleSelected = filteredBranches.length > 0
    && filteredBranches.every((branch) => selectedIds.includes(branch.id))

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      const target = event.target
      if (rootRef.current?.contains(target)) return
      setOpen(false)
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        searchRef.current?.blur()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function handleSelectAllVisible() {
    if (!filteredBranches.length) return

    const visibleIds = filteredBranches.map((branch) => branch.id)
    const merged = [...new Set([...selectedIds, ...visibleIds])]
    onSelectAll(merged)
  }

  function openMenu() {
    if (disabled || branches.length === 0) return
    setOpen(true)
  }

  function handleOpen() {
    openMenu()
  }

  function handleToggleOpen() {
    if (disabled || branches.length === 0) return
    if (open) {
      setOpen(false)
      return
    }
    openMenu()
  }

  function handleSearchChange(value) {
    setSearchInput(value)
    if (!open && branches.length > 0) {
      openMenu()
    }
  }

  const showSelectedArea = selectedBranches.length > 0 || open

  return (
    <div
      ref={rootRef}
      className={`login-branch-select${open ? ' login-branch-select--open' : ''}${disabled ? ' login-branch-select--disabled' : ''}`}
    >
      <label className="login-branch-select__label" htmlFor="login-branch-search">
        Branches
      </label>

      <div className="login-branch-select__dropdown">
        <div className={`login-branch-select__trigger${open ? ' login-branch-select__trigger--open' : ''}`}>
          <span className="login-branch-select__search-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <input
            ref={searchRef}
            id="login-branch-search"
            type="search"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={handleOpen}
            placeholder="Search and select branches…"
            aria-label="Search and select branches"
            aria-expanded={open}
            aria-haspopup="listbox"
            disabled={disabled || branches.length === 0}
          />
          {searchInput && (
            <button
              type="button"
              className="login-branch-select__icon-btn"
              onClick={() => handleSearchChange('')}
              aria-label="Clear search"
              disabled={disabled}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className="login-branch-select__icon-btn login-branch-select__icon-btn--chevron"
            onClick={handleToggleOpen}
            disabled={disabled || branches.length === 0}
            aria-label={open ? 'Close branch list' : 'Open branch list'}
          >
            <svg
              className="login-branch-select__chevron"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {open && (
          <div className="login-branch-select__menu" role="presentation">
            <div className="login-branch-select__panel">
              {branches.length === 0 && (
                <p className="login-branch-select__empty">{emptyMessage}</p>
              )}

              {branches.length > 0 && filteredBranches.length === 0 && (
                <p className="login-branch-select__empty">No branches match your search.</p>
              )}

              {filteredBranches.length > 0 && (
                <ul className="login-branch-select__list" role="listbox" aria-multiselectable="true">
                  {filteredBranches.map((branch) => {
                    const isSelected = selectedIds.includes(branch.id)

                    return (
                      <li key={branch.id} role="option" aria-selected={isSelected}>
                        <label className={`login-branch-select__option${isSelected ? ' login-branch-select__option--selected' : ''}`}>
                          <input
                            type="checkbox"
                            className="login-branch-select__checkbox"
                            checked={isSelected}
                            onChange={() => onToggle(branch.id)}
                            disabled={disabled}
                          />
                          <span className="login-branch-select__check" aria-hidden="true">
                            {isSelected && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                <path
                                  d="M5 12l4 4L19 6"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </span>
                          <span className="login-branch-select__name">{branch.name}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {branches.length > 0 && (
              <div className="login-branch-select__footer">
                <button
                  type="button"
                  className={`login-branch-select__footer-btn${allVisibleSelected || !filteredBranches.length ? ' login-branch-select__footer-btn--muted' : ''}`}
                  onClick={handleSelectAllVisible}
                  disabled={disabled || !filteredBranches.length || allVisibleSelected}
                >
                  {searchTerm ? 'Select visible' : 'Select all'}
                </button>
                <button
                  type="button"
                  className="login-branch-select__footer-btn login-branch-select__footer-btn--muted"
                  onClick={onClearAll}
                  disabled={disabled || selectedIds.length === 0}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showSelectedArea && (
        <div
          className={`login-branch-select__selected${open ? ' login-branch-select__selected--behind' : ''}${selectedBranches.length === 0 ? ' login-branch-select__selected--empty' : ''}`}
          aria-label="Selected branches"
        >
          {selectedBranches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              className="login-branch-select__chip"
              onClick={() => onToggle(branch.id)}
              disabled={disabled}
              title={`Remove ${branch.name}`}
            >
              <span>{branch.name}</span>
              <span className="login-branch-select__chip-remove" aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
