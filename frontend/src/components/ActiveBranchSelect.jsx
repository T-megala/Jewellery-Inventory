import { useState } from 'react'
import { switchBranch } from '../services/auth.js'
import { useBranchScope } from '../hooks/useBranchScope.js'
import './ActiveBranchSelect.css'

export default function ActiveBranchSelect({ branches, disabled = false }) {
  const { activeBranchId } = useBranchScope()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!branches || branches.length <= 1) {
    return null
  }

  async function handleChange(event) {
    const nextId = Number(event.target.value)
    if (!nextId || nextId === activeBranchId || saving) return

    setError('')
    setSaving(true)

    try {
      await switchBranch(nextId)
    } catch (err) {
      setError(err.message || 'Failed to switch branch.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="active-branch-select">
      <label className="active-branch-select__label" htmlFor="active-branch-select">
        Branch
      </label>
      <select
        id="active-branch-select"
        className="active-branch-select__control"
        value={activeBranchId ?? ''}
        onChange={handleChange}
        disabled={disabled || saving}
        aria-label="Active branch"
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>{branch.name}</option>
        ))}
      </select>
      {error && (
        <p className="active-branch-select__error" role="alert">{error}</p>
      )}
    </div>
  )
}
