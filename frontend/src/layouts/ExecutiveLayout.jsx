import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { getOverallDisplayName, getUser, logout } from '../services/auth.js'
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
  const displayName = getOverallDisplayName(user)
  const [now, setNow] = useState(formatDateTime())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(formatDateTime()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  function handleLogout() {
    logout()
    navigate('/overalldashboard/login', { replace: true })
  }

  return (
    <div className="overall-shell">
      <header className="overall-header">
        <div className="overall-header__inner">
          <div className="overall-header__brand">
            <img src="/images/logo.png" alt="Brand Factory" className="overall-header__logo" />
            <div className="overall-header__titles">
              <strong>Brand Factory</strong>
              <span>Garment Automation — Overall Dashboard</span>
            </div>
          </div>

          <div className="overall-header__meta">
            <span className="overall-header__live">
              <i className="overall-header__live-dot" aria-hidden="true" />
              All systems live
            </span>
            <time className="overall-header__time">{now}</time>
            <div className="overall-header__user">
              <span className="overall-header__avatar">{displayName.slice(0, 2).toUpperCase()}</span>
              <span className="overall-header__username">{displayName}</span>
            </div>
            <button type="button" className="overall-header__logout" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="overall-main">
        <Outlet />
      </main>
    </div>
  )
}
