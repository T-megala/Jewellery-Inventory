import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import LoginBranchSelect from '../components/LoginBranchSelect.jsx'
import FieldError from '../components/FieldError.jsx'
import {
  clearPendingBranchSelection,
  completeBranchSelection,
  getSelectedBranchIds,
  getUser,
  hasPendingBranchSelection,
  isAuthenticated,
  login,
  logout,
  markPendingBranchSelection,
  setSelectedBranchIds,
} from '../services/auth.js'
import '../components/FieldError.css'
import { scrollToFirstFieldError } from '../utils/formValidation.js'
import './Login.css'

function getInitialBranchIds(user) {
  const allowedIds = (user?.branches ?? []).map((branch) => branch.id)
  if (!allowedIds.length) return []

  const stored = getSelectedBranchIds(user).filter((id) => allowedIds.includes(id))
  if (stored.length) return stored

  return allowedIds
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from?.pathname || '/dashboard'
  const [step, setStep] = useState('credentials')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [selectedBranchIds, setSelectedBranchIdsState] = useState([])
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const formRef = useRef(null)
  const passwordRef = useRef(null)
  const submitRef = useRef(null)

  const branchUser = getUser()
  const branches = branchUser?.branches ?? []

  useEffect(() => {
    if (hasPendingBranchSelection() && isAuthenticated()) {
      const user = getUser()
      if (user?.branches?.length > 1) {
        setStep('branch')
        setSelectedBranchIdsState(getInitialBranchIds(user))
        return
      }
      clearPendingBranchSelection()
    }

    logout()
  }, [])

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

  function clearFieldError(key) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function toggleBranch(branchId) {
    setSelectedBranchIdsState((current) => {
      if (current.includes(branchId)) {
        return current.filter((id) => id !== branchId)
      }
      return [...current, branchId]
    })
    clearFieldError('branches')
  }

  function handleSelectAllBranches(branchIds) {
    setSelectedBranchIdsState(branchIds)
    clearFieldError('branches')
  }

  async function handleCredentialsSubmit(e) {
    e.preventDefault()
    setError('')
    const errors = {}

    if (!username.trim()) {
      errors.username = 'Username is required.'
    }
    if (!password) {
      errors.password = 'Password is required.'
    }

    setFieldErrors(errors)

    if (Object.keys(errors).length) {
      scrollToFirstFieldError(errors)
      return
    }

    setLoading(true)
    try {
      const data = await login(username.trim(), password)
      const userBranches = data.user?.branches ?? []

      if (userBranches.length <= 1) {
        setSelectedBranchIds(userBranches.map((branch) => branch.id))
        clearPendingBranchSelection()
        navigate(redirectTo, { replace: true })
        return
      }

      markPendingBranchSelection()
      setSelectedBranchIdsState(getInitialBranchIds(data.user))
      setStep('branch')
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      setFieldErrors({})
    } finally {
      setLoading(false)
    }
  }

  async function handleBranchSubmit(e) {
    e.preventDefault()
    setError('')

    if (selectedBranchIds.length === 0) {
      const errors = { branches: 'Please select at least one branch to continue.' }
      setFieldErrors(errors)
      scrollToFirstFieldError(errors)
      return
    }

    setFieldErrors({})
    setLoading(true)
    try {
      await completeBranchSelection(selectedBranchIds)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.message || 'Failed to save branch selection. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleBackToLogin() {
    logout()
    setStep('credentials')
    setUsername('')
    setPassword('')
    setSelectedBranchIdsState([])
    setError('')
    setFieldErrors({})
  }

  return (
    <div className={`login-page${step === 'branch' ? ' login-page--branch' : ''}`}>
      <aside className="login-hero">
        <div className="hero-overlay" aria-hidden="true" />

        <div className="hero-layout">
          <header className="hero-header">
            <img
              src="/images/logo.png"
              alt="Jeyachandran Gold House"
              className="hero-logo"
            />
            <div className="hero-header-text">
              <h1 className="hero-title">Jeyachandran Gold House</h1>
              <p className="hero-tagline">Jewellery &amp; Gold Inventory System</p>
            </div>
          </header>

          <p className="hero-message">
            Manage your showroom stock, sales and gold inventory — all in one place.
          </p>

          <footer className="hero-footer">
            &copy;
            {' '}
            {new Date().getFullYear()}
            {' '}
            Jeyachandran Gold House
          </footer>
        </div>
      </aside>

      <main className="login-main">
        <div className={`login-card${step === 'branch' ? ' login-card--branch' : ''}`}>
          {step === 'credentials' ? (
            <>
              <div className="login-form-header">
                <p className="form-eyebrow">Welcome Back</p>
                <h2>Login to your account</h2>
                <p>Enter your username and password to continue</p>
              </div>

              <form ref={formRef} className="login-form" onSubmit={handleCredentialsSubmit} noValidate>
                {error && (
                  <div className="form-banner-error" role="alert">
                    {error}
                  </div>
                )}

                <div className={`form-field${fieldErrors.username ? ' field-invalid' : ''}`}>
                  <label htmlFor="username">Username</label>
                  <div className="input-box">
                    <svg className="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M20 21a8 8 0 10-16 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                    <input
                      id="username"
                      type="text"
                      placeholder="Enter your username"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value)
                        clearFieldError('username')
                      }}
                      onKeyDown={handleUsernameKeyDown}
                      autoComplete="username"
                      disabled={loading}
                      aria-invalid={Boolean(fieldErrors.username)}
                      aria-describedby={fieldErrors.username ? 'field-error-username' : undefined}
                    />
                  </div>
                  <FieldError id="field-error-username" message={fieldErrors.username} />
                </div>

                <div className={`form-field${fieldErrors.password ? ' field-invalid' : ''}`}>
                  <label htmlFor="password">Password</label>
                  <div className="input-box">
                    <svg className="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M8 11V8a4 4 0 118 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    <input
                      id="password"
                      ref={passwordRef}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        clearFieldError('password')
                      }}
                      onKeyDown={handlePasswordKeyDown}
                      autoComplete="current-password"
                      disabled={loading}
                      aria-invalid={Boolean(fieldErrors.password)}
                      aria-describedby={fieldErrors.password ? 'field-error-password' : undefined}
                    />
                    <button
                      type="button"
                      className="show-btn"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <FieldError id="field-error-password" message={fieldErrors.password} />
                </div>

                <button ref={submitRef} type="submit" className="login-btn" disabled={loading}>
                  {loading ? 'Logging in…' : 'Login'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="login-form-header">
                <p className="form-eyebrow">Select Showrooms</p>
                <h2>Choose your branches</h2>
                <p>
                  Welcome,
                  {' '}
                  <strong>{branchUser?.fullName || branchUser?.username}</strong>
                  . Select one or more branches assigned to you.
                </p>
              </div>

              <form className="login-form login-form--branch" onSubmit={handleBranchSubmit} noValidate>
                {error && (
                  <div className="form-banner-error" role="alert">
                    {error}
                  </div>
                )}

                <div className={`login-branch-picker${fieldErrors.branches ? ' field-invalid' : ''}`}>
                  <LoginBranchSelect
                    branches={branches}
                    selectedIds={selectedBranchIds}
                    onToggle={toggleBranch}
                    onSelectAll={handleSelectAllBranches}
                    onClearAll={() => {
                      setSelectedBranchIdsState([])
                      clearFieldError('branches')
                    }}
                    disabled={loading}
                    emptyMessage="No branches are assigned to your account."
                  />
                  <FieldError id="field-error-branches" message={fieldErrors.branches} />
                </div>

                <div className="login-branch-actions">
                  <button
                    type="button"
                    className="login-btn login-btn--ghost"
                    onClick={handleBackToLogin}
                    disabled={loading}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="login-btn"
                    disabled={loading || selectedBranchIds.length === 0}
                  >
                    {loading ? 'Continuing…' : 'Continue'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
