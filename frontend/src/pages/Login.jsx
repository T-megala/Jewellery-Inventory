import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { login, logout } from '../services/auth.js'
import './Login.css'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from?.pathname || '/dashboard'
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
      setError('Your session has expired. Please sign in again.')
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
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <aside className="login-hero">
        <div className="hero-overlay" aria-hidden="true" />

        <div className="hero-layout">
          <header className="hero-header">
            <img
              src="/images/logo.png"
              alt="Brand Factory"
              className="hero-logo"
            />
            <div className="hero-header-text">
              <h1 className="hero-title">Brand Factory</h1>
              <p className="hero-tagline">From Gujarat &mdash; Men&apos;s &amp; Boys&apos; Dress Shop</p>
            </div>
          </header>

          <p className="hero-message">
            Manage your men&apos;s and boys&apos; dress stock, sales and inventory — all in one place.
          </p>

          <footer className="hero-footer">
            &copy; {new Date().getFullYear()} Brand Factory
          </footer>
        </div>
      </aside>

      <main className="login-main">
        <div className="login-card">
          <div className="login-form-header">
            <p className="form-eyebrow">Welcome Back</p>
            <h2>Login to your account</h2>
            <p>Enter your username and password to continue</p>
          </div>

          <form ref={formRef} className="login-form" onSubmit={handleSubmit} noValidate>
            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <div className="form-field">
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
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={handleUsernameKeyDown}
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="form-field">
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
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handlePasswordKeyDown}
                  autoComplete="current-password"
                  disabled={loading}
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
            </div>

            <button ref={submitRef} type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Logging in…' : 'Login'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
