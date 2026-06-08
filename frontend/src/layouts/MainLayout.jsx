import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { getUser, logout } from '../services/auth.js'
import './MainLayout.css'

const MAIN_NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/import', label: 'Import', icon: 'import' },
  { to: '/stock', label: 'Stock', icon: 'stock' },
]

const REPORTS_NAV_ITEMS = [
  { to: '/reports', label: 'Reports', icon: 'reports' },
]

const PAGE_META = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Your showroom at a glance' },
  '/import': { title: 'Bulk Stock Upload', subtitle: 'Tag Wise Stock Report — Excel import' },
  '/stock': { title: 'Stock', subtitle: 'All products in your showroom' },
  '/reports': { title: 'Reports', subtitle: 'Sales, stock and gold rate insights' },
}

function NavIcon({ name }) {
  if (name === 'dashboard') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="3" width="8" height="5" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="10" width="8" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }
  if (name === 'import') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3v12M8 11l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }
  if (name === 'stock') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7l8-4 8 4-8 4-8-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M4 12l8 4 8-4M4 17l8 4 8-4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19V5M4 19h16M8 15l3-3 3 2 4-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function getInitials(name) {
  if (!name) return 'U'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function formatToday() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = getUser()
  const displayName = user?.name || user?.username || 'User'
  const page = PAGE_META[location.pathname] || PAGE_META['/dashboard']

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-glow" aria-hidden="true" />

        <div className="sidebar-brand">
          <div className="sidebar-logo-wrap">
            <img src="/images/logo.png" alt="Jeyachandran Gold House" className="sidebar-logo" />
          </div>
          <div className="sidebar-brand__text">
            <p className="sidebar-name">Jeyachandran</p>
            <p className="sidebar-tagline">Gold House</p>
            <span className="sidebar-brand__line" aria-hidden="true" />
          </div>
        </div>

        <div className="sidebar-nav-wrap">
          <p className="sidebar-menu-label">Main Menu</p>
          <nav className="sidebar-nav">
            {MAIN_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `sidebar-link${isActive ? ' sidebar-link--active' : ''}`
                }
              >
                <span className="sidebar-link__icon">
                  <NavIcon name={item.icon} />
                </span>
                <span className="sidebar-link__label">{item.label}</span>
                <span className="sidebar-link__indicator" aria-hidden="true" />
              </NavLink>
            ))}
          </nav>

          <p className="sidebar-menu-label sidebar-menu-label--reports">Reports</p>
          <nav className="sidebar-nav sidebar-nav--reports">
            {REPORTS_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `sidebar-link${isActive ? ' sidebar-link--active' : ''}`
                }
              >
                <span className="sidebar-link__icon">
                  <NavIcon name={item.icon} />
                </span>
                <span className="sidebar-link__label">{item.label}</span>
                <span className="sidebar-link__indicator" aria-hidden="true" />
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <button type="button" className="sidebar-logout" onClick={handleLogout}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <h1 className="topbar-title">{page.title}</h1>
            <p className="topbar-subtitle">{page.subtitle}</p>
          </div>

          <div className="topbar-right">
            <time className="topbar-date" dateTime={new Date().toISOString().slice(0, 10)}>
              {formatToday()}
            </time>

            <div className="topbar-user">
              <span className="topbar-user__avatar">{getInitials(displayName)}</span>
              <div className="topbar-user__text">
                <p className="topbar-user__name">{displayName}</p>
                <p className="topbar-user__role">{user?.role || 'Staff'}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="page-content">
          <div className="page-content__inner">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
