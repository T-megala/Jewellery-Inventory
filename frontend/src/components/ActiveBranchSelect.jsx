import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ALL_BRANCHES_VALUE,
  setOperationalBranch,
} from '../services/auth.js'
import { useBranchScope } from '../hooks/useBranchScope.js'
import './ActiveBranchSelect.css'

function matchesSearch(label, term) {
  if (!term) return true
  return label.toLowerCase().includes(term)
}

export default function ActiveBranchSelect({
  branches,
  disabled = false,
  alwaysShow = false,
  layout = 'default',
}) {
  const { operationalValue } = useBranchScope()
  const [open, setOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')

  const rootRef = useRef(null)
  const searchRef = useRef(null)
  const searchTerm = searchInput.trim().toLowerCase()

  const options = useMemo(() => {
    const items = []

    if (branches.length > 1) {
      items.push({ value: ALL_BRANCHES_VALUE, label: 'All branches' })
    }

    branches.forEach((branch) => {
      items.push({ value: String(branch.id), label: branch.name })
    })

    return items
  }, [branches])

  const filteredOptions = useMemo(
    () => options.filter((option) => matchesSearch(option.label, searchTerm)),
    [options, searchTerm],
  )

  const selectedLabel = useMemo(() => {
    const match = options.find((option) => option.value === String(operationalValue))
    return match?.label ?? 'Select branch'
  }, [options, operationalValue])

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      if (rootRef.current?.contains(event.target)) return
      setOpen(false)
      setSearchInput('')
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        setSearchInput('')
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
  }, [open])

  if (!branches?.length) {
    return null
  }

  if (!alwaysShow && branches.length <= 1) {
    return null
  }

  const selectId = `active-branch-select-${layout}`

  function handleSelect(value) {
    if (value === operationalValue) {
      setOpen(false)
      setSearchInput('')
      return
    }

    if (value === ALL_BRANCHES_VALUE) {
      setOperationalBranch(ALL_BRANCHES_VALUE)
    } else {
      const nextId = Number(value)
      if (nextId) {
        setOperationalBranch(nextId)
      }
    }

    setOpen(false)
    setSearchInput('')
  }

  function toggleOpen() {
    if (disabled) return
    setOpen((current) => {
      if (current) {
        setSearchInput('')
      }
      return !current
    })
  }

  const selectControl = (
    <div
      ref={rootRef}
      className={`active-branch-select__field${open ? ' active-branch-select__field--open' : ''}`}
    >
      <button
        type="button"
        id={selectId}
        className="active-branch-select__control"
        onClick={toggleOpen}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Branch: ${selectedLabel}`}
      >
        <span className="active-branch-select__value">{selectedLabel}</span>
        <span className={`active-branch-select__chevron${open ? ' active-branch-select__chevron--open' : ''}`} aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open && (
        <div className="active-branch-select__menu" role="presentation">
          <div className="active-branch-select__search-wrap">
            <span className="active-branch-select__search-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <input
              ref={searchRef}
              type="search"
              className="active-branch-select__search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search branches…"
              aria-label="Search branches"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredOptions.length === 1) {
                  e.preventDefault()
                  handleSelect(filteredOptions[0].value)
                }
              }}
            />
          </div>

          <ul className="active-branch-select__list" role="listbox" aria-label="Branches">
            {filteredOptions.length === 0 && (
              <li className="active-branch-select__empty">No branches match your search.</li>
            )}
            {filteredOptions.map((option) => {
              const isSelected = String(operationalValue) === option.value

              return (
                <li key={option.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    className={`active-branch-select__option${isSelected ? ' active-branch-select__option--selected' : ''}`}
                    onClick={() => handleSelect(option.value)}
                  >
                    <span>{option.label}</span>
                    {isSelected && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M5 12l4 4L19 6"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )

  if (layout === 'filter') {
    return (
      <div className="report-field active-branch-select active-branch-select--filter">
        <span className="active-branch-select__label" id={`${selectId}-label`}>Branch</span>
        {selectControl}
      </div>
    )
  }

  return (
    <div className={`active-branch-select active-branch-select--${layout}`}>
      <span className="active-branch-select__label" id={`${selectId}-label`}>Branch</span>
      {selectControl}
    </div>
  )
}
