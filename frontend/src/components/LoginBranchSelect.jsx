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
      <div className="login-branch-select__search input-box">
        <svg className="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search showroom name…"
          aria-label="Search showrooms"
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
            ×
          </button>
        )}
      </div>

      <div className="login-branch-select__meta">
        <span className="login-branch-select__count">
          {selectedIds.length}
          {' '}
          {selectedIds.length === 1 ? 'showroom' : 'showrooms'}
          {' '}
          selected
        </span>

        <div className="login-branch-select__actions">
          <button
            type="button"
            className="login-branch-select__action"
            onClick={handleSelectAllVisible}
            disabled={disabled || !filteredBranches.length || allVisibleSelected}
          >
            {searchTerm ? 'Select visible' : 'Select all'}
          </button>
          <span className="login-branch-select__action-divider" aria-hidden="true">·</span>
          <button
            type="button"
            className="login-branch-select__action"
            onClick={onClearAll}
            disabled={disabled || selectedIds.length === 0}
          >
            Clear all
          </button>
        </div>
      </div>

      <div className="login-branch-select__panel">
        {branches.length === 0 && (
          <p className="login-branch-select__empty">{emptyMessage}</p>
        )}

        {branches.length > 0 && filteredBranches.length === 0 && (
          <p className="login-branch-select__empty">No showrooms match your search.</p>
        )}

        {filteredBranches.length > 0 && (
          <ul className="login-branch-select__list">
            {filteredBranches.map((branch) => {
              const isSelected = selectedIds.includes(branch.id)

              return (
                <li key={branch.id}>
                  <label
                    className={`login-branch-select__option${isSelected ? ' login-branch-select__option--selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggle(branch.id)}
                      disabled={disabled}
                    />
                    <span className="login-branch-select__option-body">
                      <span className="login-branch-select__option-name">{branch.name}</span>
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
