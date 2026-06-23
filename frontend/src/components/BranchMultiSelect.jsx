import { useMemo, useState } from 'react'

function matchesBranchSearch(branch, term) {
  if (!term) return true
  const haystack = [branch.name, branch.city, branch.address]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(term)
}

function isBranchSelected(selectedIds, branchId) {
  const id = Number(branchId)
  return selectedIds.some((selectedId) => Number(selectedId) === id)
}

export default function BranchMultiSelect({
  branches,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  disabled = false,
  loading = false,
  emptyMessage = 'No branches available.',
}) {
  const [searchInput, setSearchInput] = useState('')

  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.isActive !== false),
    [branches],
  )

  const searchTerm = searchInput.trim().toLowerCase()

  const filteredBranches = useMemo(
    () => activeBranches.filter((branch) => matchesBranchSearch(branch, searchTerm)),
    [activeBranches, searchTerm],
  )

  const selectedBranches = useMemo(
    () => activeBranches.filter((branch) => isBranchSelected(selectedIds, branch.id)),
    [activeBranches, selectedIds],
  )

  const allVisibleSelected = filteredBranches.length > 0
    && filteredBranches.every((branch) => isBranchSelected(selectedIds, branch.id))

  function handleSelectAllVisible() {
    if (!filteredBranches.length || !onSelectAll) return

    const visibleIds = filteredBranches.map((branch) => branch.id)
    const merged = [...new Set([...selectedIds.map(Number), ...visibleIds.map(Number)])]
    onSelectAll(merged)
  }

  return (
    <div className="branch-multi-select">
      <div className="branch-multi-select__toolbar">
        <div className="branch-multi-select__search">
          <span className="branch-multi-select__search-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search branch name or city…"
            aria-label="Search branches"
            disabled={disabled || loading}
          />
          {searchInput && (
            <button
              type="button"
              className="branch-multi-select__search-clear"
              onClick={() => setSearchInput('')}
              aria-label="Clear branch search"
              disabled={disabled || loading}
            >
              ×
            </button>
          )}
        </div>

        <span className="branch-multi-select__count">
          {selectedIds.length}
          {' '}
          selected
        </span>

        {onSelectAll && (
          <div className="branch-multi-select__actions">
            <button
              type="button"
              className="branch-multi-select__action"
              onClick={handleSelectAllVisible}
              disabled={disabled || loading || !filteredBranches.length || allVisibleSelected}
            >
              {searchTerm ? 'Select visible' : 'Select all'}
            </button>
          </div>
        )}
      </div>

      <div className={`branch-multi-select__summary${selectedIds.length ? ' branch-multi-select__summary--visible' : ''}`}>
        {selectedIds.length > 0 ? (
          <div className="branch-multi-select__chips">
            {selectedBranches.map((branch) => (
              <button
                key={branch.id}
                type="button"
                className="branch-multi-select__chip"
                onClick={() => onToggle(branch.id)}
                disabled={disabled}
                title={`Remove ${branch.name}`}
              >
                <span>{branch.name}</span>
                <span className="branch-multi-select__chip-remove" aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="branch-multi-select__summary-empty">No branches selected yet.</p>
        )}

        {selectedIds.length > 0 && (
          <button
            type="button"
            className="branch-multi-select__clear"
            onClick={onClearAll}
            disabled={disabled}
          >
            Clear all
          </button>
        )}
      </div>

      <div className="branch-multi-select__panel">
        {loading && (
          <p className="branch-multi-select__status" role="status">Loading branches…</p>
        )}

        {!loading && activeBranches.length === 0 && (
          <p className="branch-multi-select__status">{emptyMessage}</p>
        )}

        {!loading && activeBranches.length > 0 && filteredBranches.length === 0 && (
          <p className="branch-multi-select__status">No branches match your search.</p>
        )}

        {!loading && filteredBranches.length > 0 && (
          <ul className="branch-multi-select__list">
            {filteredBranches.map((branch) => {
              const isSelected = isBranchSelected(selectedIds, branch.id)

              return (
                <li key={branch.id}>
                  <label
                    className={`branch-multi-select__option${isSelected ? ' branch-multi-select__option--selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggle(branch.id)}
                      disabled={disabled}
                    />
                    <span className="branch-multi-select__option-text">
                      <strong>{branch.name}</strong>
                      {branch.city && <small>{branch.city}</small>}
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
