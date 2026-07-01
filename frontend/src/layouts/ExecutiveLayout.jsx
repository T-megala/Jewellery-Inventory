import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { getUser, logout } from '../services/auth.js'
import './ExecutiveLayout.css'

function formatDateTime() {
  return new Date().toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export default function ExecutiveLayout() {
  const navigate = useNavigate()
  const user = getUser()
  const displayName = user?.name || user?.username || 'CEO'
  const [now, setNow] = useState(formatDateTime())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(formatDateTime()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  function handleLogout() {
    logout()
    navigate('/login/ceo', { replace: true })
  }

  return (
    <div className="ceo-shell">
      <header className="ceo-header">
        <div className="ceo-header__inner">
          <div className="ceo-header__brand">
            <img src="/images/logo.png" alt="Brand Factory" className="ceo-header__logo" />
            <div className="ceo-header__titles">
              <strong>Brand Factory</strong>
              <span>Garment Automation — CEO Dashboard</span>
            </div>
          </div>

          <div className="ceo-header__meta">
            <span className="ceo-header__live">
              <i className="ceo-header__live-dot" aria-hidden="true" />
              All systems live
            </span>
            <time className="ceo-header__time">{now}</time>
            <div className="ceo-header__user">
              <span className="ceo-header__avatar">{displayName.slice(0, 2).toUpperCase()}</span>
              <span className="ceo-header__username">{displayName}</span>
            </div>
            <button type="button" className="ceo-header__logout" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="ceo-main">
        <Outlet />
      </main>
    </div>
  )
}
