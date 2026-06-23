import { useMemo, useState } from 'react'
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
  const [searchInput, setSearchInput] = useState('')
  const searchTerm = searchInput.trim().toLowerCase()

  const filteredBranches = useMemo(
    () => branches.filter((branch) => matchesSearch(branch, searchTerm)),
    [branches, searchTerm],
  )

  const allVisibleSelected = filteredBranches.length > 0
    && filteredBranches.every((branch) => selectedIds.includes(branch.id))

  function handleSelectAllVisible() {
    if (!filteredBranches.length) return

    const visibleIds = filteredBranches.map((branch) => branch.id)
    const merged = [...new Set([...selectedIds, ...visibleIds])]
    onSelectAll(merged)
  }

  return (
    <div className="login-branch-select">
      <div className="login-branch-select__toolbar">
        <div className="login-branch-select__search">
          <span className="login-branch-select__search-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search branches…"
            aria-label="Search branches"
            disabled={disabled}
          />
          {searchInput && (
            <button
              type="button"
              className="login-branch-select__search-clear"
              onClick={() => setSearchInput('')}
              aria-label="Clear search"
              disabled={disabled}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        <div className="login-branch-select__controls">
          <span className="login-branch-select__badge">
            {selectedIds.length}
            {' '}
            selected
          </span>
          <div className="login-branch-select__btn-group">
            <button
              type="button"
              className="login-branch-select__btn"
              onClick={handleSelectAllVisible}
              disabled={disabled || !filteredBranches.length || allVisibleSelected}
            >
              {searchTerm ? 'Select visible' : 'Select all'}
            </button>
            <button
              type="button"
              className="login-branch-select__btn"
              onClick={onClearAll}
              disabled={disabled || selectedIds.length === 0}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

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
                  <label
                    className={`login-branch-select__row${isSelected ? ' login-branch-select__row--selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="login-branch-select__checkbox"
                      checked={isSelected}
                      onChange={() => onToggle(branch.id)}
                      disabled={disabled}
                    />
                    <span className="login-branch-select__name">{branch.name}</span>
                    <span className="login-branch-select__indicator" aria-hidden="true">
                      {isSelected && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M5 12l4 4L19 6"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
