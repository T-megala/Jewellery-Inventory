import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import FieldError from '../components/FieldError.jsx'
import { endLogoutTransition, login } from '../services/auth.js'
import '../components/FieldError.css'
import { scrollToFirstFieldError } from '../utils/formValidation.js'
import './Login.css'

function getRedirectPath(location) {
  const fromState = location.state?.from?.pathname
  if (fromState && fromState !== '/login') return fromState
  return '/dashboard'
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = getRedirectPath(location)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const formRef = useRef(null)
  const passwordRef = useRef(null)
  const submitRef = useRef(null)

  useEffect(() => {
    endLogoutTransition()
  }, [])

  useEffect(() => {
    if (location.search) {
      navigate('/login', { replace: true })
    }
  }, [location.search, navigate])

  useEffect(() => {
    setUsername('')
    setPassword('')
    setError('')
    setFieldErrors({})
  }, [location.key])

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
      await login(username.trim(), password)
      navigate(redirectTo)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      setFieldErrors({})
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
        <div className="login-card">
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
        </div>
      </main>
    </div>
  )
}
