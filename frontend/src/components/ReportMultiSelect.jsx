import { useEffect, useMemo, useRef, useState } from 'react'

function matchesSearch(label, term) {
  if (!term) return true
  return String(label).toLowerCase().includes(term)
}

function getDisplayLabel(selectedNames, emptyLabel, itemLabel) {
  if (!selectedNames.length) return emptyLabel
  if (selectedNames.length === 1) return selectedNames[0]
  return `${selectedNames.length} ${itemLabel} selected`
}

function splitOptionsForDisplay(options, selectedNames) {
  const selected = []
  const unselected = []

  options.forEach((item) => {
    if (selectedNames.includes(item.name)) selected.push(item)
    else unselected.push(item)
  })

  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  selected.sort(byName)
  unselected.sort(byName)

  return { selectedOptions: selected, unselectedOptions: unselected }
}

export default function ReportMultiSelect({
  options,
  selectedNames,
  onChange,
  disabled = false,
  emptyLabel = 'All',
  itemLabel = 'items',
  searchPlaceholder = 'Search…',
}) {
  const [open, setOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const rootRef = useRef(null)
  const searchRef = useRef(null)
  const listRef = useRef(null)
  const wasOpenRef = useRef(false)
  const pinOrderRef = useRef([])

  const searchTerm = searchInput.trim().toLowerCase()

  const filteredOptions = useMemo(
    () => options.filter((item) => matchesSearch(item.name, searchTerm)),
    [options, searchTerm],
  )

  const [layoutVersion, setLayoutVersion] = useState(0)

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      pinOrderRef.current = [...selectedNames]
      setLayoutVersion((value) => value + 1)
    }
    wasOpenRef.current = open
  }, [open, selectedNames])

  useEffect(() => {
    if (!open) return
    pinOrderRef.current = [...selectedNames]
    setLayoutVersion((value) => value + 1)
  }, [open, searchTerm])

  const { selectedOptions, unselectedOptions } = useMemo(() => {
    return splitOptionsForDisplay(filteredOptions, pinOrderRef.current)
    // layoutVersion forces a fresh pin when the panel opens or search changes
  }, [filteredOptions, layoutVersion])

  const liveSelectedInView = useMemo(
    () => filteredOptions.filter((item) => selectedNames.includes(item.name)),
    [filteredOptions, selectedNames],
  )

  const allVisibleSelected = filteredOptions.length > 0
    && filteredOptions.every((item) => selectedNames.includes(item.name))

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
    listRef.current?.scrollTo({ top: 0 })
  }, [open, layoutVersion])

  function toggleOption(name) {
    if (selectedNames.includes(name)) {
      onChange(selectedNames.filter((item) => item !== name))
      return
    }
    onChange([...selectedNames, name])
  }

  function handleSelectAllVisible() {
    const visibleNames = filteredOptions.map((item) => item.name)
    onChange([...new Set([...selectedNames, ...visibleNames])])
  }

  function handleClearAll() {
    onChange([])
  }

  function renderOption(item) {
    const isSelected = selectedNames.includes(item.name)
    return (
      <li key={item.id ?? item.name}>
        <label className={`report-multi-select__option${isSelected ? ' report-multi-select__option--selected' : ''}`}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleOption(item.name)}
          />
          <span>{item.name}</span>
        </label>
      </li>
    )
  }

  return (
    <div
      ref={rootRef}
      className={`report-multi-select${open ? ' report-multi-select--open' : ''}`}
    >
      <button
        type="button"
        className="report-multi-select__control"
        onClick={() => !disabled && setOpen((value) => !value)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="report-multi-select__value">
          {getDisplayLabel(selectedNames, emptyLabel, itemLabel)}
        </span>
        <span className="report-multi-select__chevron" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="report-multi-select__panel">
          <div className="report-multi-select__search">
            <input
              ref={searchRef}
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
          </div>

          <div className="report-multi-select__actions">
            <button
              type="button"
              className="report-multi-select__action"
              onClick={handleSelectAllVisible}
              disabled={!filteredOptions.length || allVisibleSelected}
            >
              Select visible
            </button>
            <button
              type="button"
              className="report-multi-select__action"
              onClick={handleClearAll}
              disabled={!selectedNames.length}
            >
              Clear all
            </button>
          </div>

          <ul ref={listRef} className="report-multi-select__list" role="listbox" aria-multiselectable="true">
            {filteredOptions.length === 0 ? (
              <li className="report-multi-select__empty">No options match your search.</li>
            ) : (
              <>
                {selectedOptions.length > 0 ? (
                  <>
                    <li className="report-multi-select__section-label" aria-hidden="true">
                      Selected ({liveSelectedInView.length})
                    </li>
                    {selectedOptions.map(renderOption)}
                  </>
                ) : null}
                {selectedOptions.length > 0 && unselectedOptions.length > 0 ? (
                  <li className="report-multi-select__divider" role="separator" aria-hidden="true" />
                ) : null}
                {unselectedOptions.length > 0 ? (
                  <>
                    {selectedOptions.length > 0 ? (
                      <li className="report-multi-select__section-label" aria-hidden="true">
                        All options
                      </li>
                    ) : null}
                    {unselectedOptions.map(renderOption)}
                  </>
                ) : null}
              </>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
