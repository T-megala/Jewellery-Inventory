import { useState } from 'react'
import {
  ALL_BRANCHES_VALUE,
  setOperationalBranch,
  switchBranch,
} from '../services/auth.js'
import { useBranchScope } from '../hooks/useBranchScope.js'
import './ActiveBranchSelect.css'

export default function ActiveBranchSelect({
  branches,
  disabled = false,
  alwaysShow = false,
  layout = 'default',
}) {
  const { operationalValue } = useBranchScope()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!branches?.length) {
    return null
  }

  if (!alwaysShow && branches.length <= 1) {
    return null
  }

  const selectId = `active-branch-select-${layout}`

  async function handleChange(event) {
    const value = event.target.value
    if (value === operationalValue || saving) return

    setError('')
    setSaving(true)

    try {
      if (value === ALL_BRANCHES_VALUE) {
        setOperationalBranch(ALL_BRANCHES_VALUE)
        return
      }

      const nextId = Number(value)
      if (!nextId) return

      await switchBranch(nextId)
      setOperationalBranch(nextId)
    } catch (err) {
      setError(err.message || 'Failed to switch branch.')
    } finally {
      setSaving(false)
    }
  }

  const selectControl = (
    <div className="active-branch-select__field">
      <select
        id={selectId}
        className="active-branch-select__control"
        value={operationalValue}
        onChange={handleChange}
        disabled={disabled || saving}
        aria-label="Select branch"
      >
        {branches.length > 1 && (
          <option value={ALL_BRANCHES_VALUE}>All branches</option>
        )}
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>{branch.name}</option>
        ))}
      </select>
      <span className="active-branch-select__chevron" aria-hidden="true">
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
    </div>
  )

  if (layout === 'filter') {
    return (
      <label className="report-field active-branch-select active-branch-select--filter" htmlFor={selectId}>
        <span>Branch</span>
        {selectControl}
        {error && (
          <p className="active-branch-select__error" role="alert">{error}</p>
        )}
      </label>
    )
  }

  return (
    <div className={`active-branch-select active-branch-select--${layout}`}>
      <label className="active-branch-select__label" htmlFor={selectId}>
        Branch
      </label>
      {selectControl}
      {error && (
        <p className="active-branch-select__error" role="alert">{error}</p>
      )}
    </div>
  )
}
