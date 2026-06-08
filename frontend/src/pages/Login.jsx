import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, isAuthenticated } from '../services/auth.js'
import './Login.css'

export default function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (isAuthenticated()) {
    navigate('/dashboard', { replace: true })
    return null
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
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img
            src="/images/logo.png"
            alt="Jeyachandran Gold House"
            className="login-logo"
          />
          <h1>Jeyachandran Gold House</h1>
          <p>Sign in to manage your inventory</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-field">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
