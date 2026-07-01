import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { login, logout, isCeo } from '../services/auth.js'
import './CeoLogin.css'

export default function CeoLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const formRef = useRef(null)
  const passwordRef = useRef(null)
  const submitRef = useRef(null)

  useEffect(() => {
    logout()
    if (location.state?.sessionExpired) {
      setError('Your executive session has expired. Please sign in again.')
    }
  }, [location.state])

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

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!username.trim()) {
      setError('Username is required')
      return
    }
    if (!password) {
      setError('Password is required')
      return
    }

    setLoading(true)
    try {
      await login(username.trim(), password)

      if (!isCeo()) {
        logout()
        setError('This portal is for CEO accounts only. Use staff login for store access.')
        return
      }

      const from = location.state?.from?.pathname
      const destination = from?.startsWith('/dashboard/ceo') ? from : '/dashboard/ceo'
      navigate(destination, { replace: true })
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ceo-login-page">
      <aside className="ceo-login-hero">
        <div className="ceo-login-hero__overlay" aria-hidden="true" />
        <div className="ceo-login-hero__content">
          <header className="ceo-login-hero__header">
            <img src="/images/logo.png" alt="Brand Factory" className="ceo-login-hero__logo" />
            <div>
              <h1>Brand Factory</h1>
              <p>Garment Automation — Executive Portal</p>
            </div>
          </header>

          <div className="ceo-login-hero__features">
            <div className="ceo-login-hero__feature">
              <span className="ceo-login-hero__feature-icon" aria-hidden="true">📊</span>
              <div>
                <strong>Company-wide KPIs</strong>
                <p>Warehouse stock, sales trends, and batch performance</p>
              </div>
            </div>
            <div className="ceo-login-hero__feature">
              <span className="ceo-login-hero__feature-icon" aria-hidden="true">🏭</span>
              <div>
                <strong>Multi-segment view</strong>
                <p>Warehouse, retail, and franchise dashboards</p>
              </div>
            </div>
            <div className="ceo-login-hero__feature">
              <span className="ceo-login-hero__feature-icon" aria-hidden="true">🔒</span>
              <div>
                <strong>Executive access only</strong>
                <p>Restricted to authorised leadership accounts</p>
              </div>
            </div>
          </div>

          <footer className="ceo-login-hero__footer">
            &copy; {new Date().getFullYear()} Brand Factory
          </footer>
        </div>
      </aside>

      <main className="ceo-login-main">
        <div className="ceo-login-card">
          <div className="ceo-login-card__badge">Executive Access</div>

          <div className="ceo-login-card__header">
            <h2>CEO Sign In</h2>
            <p>Enter your executive credentials to access the company dashboard</p>
          </div>

          <form ref={formRef} className="ceo-login-form" onSubmit={handleSubmit} noValidate>
            {error && (
              <div className="ceo-login-error" role="alert">
                {error}
                {error.includes('staff login') && (
                  <p className="ceo-login-error__link">
                    <Link to="/login">Go to staff sign in →</Link>
                  </p>
                )}
              </div>
            )}

            <div className="ceo-login-field">
              <label htmlFor="ceo-username">Username</label>
              <div className="ceo-login-input">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 21a8 8 0 10-16 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
                </svg>
                <input
                  id="ceo-username"
                  type="text"
                  placeholder="Executive username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={handleUsernameKeyDown}
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="ceo-login-field">
              <label htmlFor="ceo-password">Password</label>
              <div className="ceo-login-input">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M8 11V8a4 4 0 118 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <input
                  id="ceo-password"
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handlePasswordKeyDown}
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="ceo-login-show"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button ref={submitRef} type="submit" className="ceo-login-btn" disabled={loading}>
              {loading ? 'Signing in…' : 'Access Executive Dashboard'}
            </button>
          </form>

          <p className="ceo-login-switch">
            Store staff?{' '}
            <Link to="/login">Sign in to staff portal</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
