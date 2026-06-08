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
  '/import': { title: 'Import', subtitle: 'Upload daily stock via Excel' },
  '/stock': { title: 'Stock', subtitle: 'All products in your showroom' },
  '/reports': { title: 'Reports', subtitle: 'Sales, stock and gold rate insights' },
}

function NavIcon({ name }) {
  if (name === 'dashboard') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="3" width="8" height="5" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="10" width="8" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }
  if (name === 'import') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3v12M8 11l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }
  if (name === 'stock') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7l8-4 8 4-8 4-8-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M4 12l8 4 8-4M4 17l8 4 8-4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
    weekday: 'short',
    day: 'numeric',
    month: 'short',
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
      <header className="shell-header">
        <div className="shell-header__brand">
          <div className="shell-header__logo-wrap">
            <img src="/images/logo.png" alt="Jeyachandran Gold House" className="shell-header__logo" />
          </div>
          <div>
            <p className="shell-header__name">Jeyachandran</p>
            <p className="shell-header__tagline">Gold House</p>
          </div>
        </div>

        <div className="shell-header__main">
          <div className="shell-header__page">
            <p className="shell-header__crumb">
              <span>Inventory</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span>{page.title}</span>
            </p>
            <h1 className="shell-header__title">{page.title}</h1>
            <p className="shell-header__subtitle">{page.subtitle}</p>
          </div>

          <div className="shell-header__actions">
            <div className="shell-header__chip shell-header__date">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span>{formatToday()}</span>
            </div>

            <div className="shell-header__chip shell-header__user">
              <span className="shell-header__avatar">{getInitials(displayName)}</span>
              <div>
                <p className="shell-header__user-name">{displayName}</p>
                <p className="shell-header__user-role">{user?.role || 'Staff'}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <div className="sidebar-nav-wrap">
            <div className="sidebar-section">
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
                    <span className="sidebar-link__rail" aria-hidden="true" />
                    <span className="sidebar-link__icon">
                      <NavIcon name={item.icon} />
                    </span>
                    <span className="sidebar-link__label">{item.label}</span>
                  </NavLink>
                ))}
              </nav>
            </div>

            <div className="sidebar-section">
              <p className="sidebar-menu-label">Reports</p>
              <nav className="sidebar-nav">
                {REPORTS_NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `sidebar-link${isActive ? ' sidebar-link--active' : ''}`
                    }
                  >
                    <span className="sidebar-link__rail" aria-hidden="true" />
                    <span className="sidebar-link__icon">
                      <NavIcon name={item.icon} />
                    </span>
                    <span className="sidebar-link__label">{item.label}</span>
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>

          <div className="sidebar-footer">
            <button type="button" className="sidebar-logout" onClick={handleLogout}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Sign out
            </button>
          </div>
        </aside>

        <main className="page-content">
          <div className="page-content__inner">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
