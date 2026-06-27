import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { MASTER_PATHS } from '../config/masters.js'
import ActiveBranchSelect from '../components/ActiveBranchSelect.jsx'
import { useBranchScope } from '../hooks/useBranchScope.js'
import {
  getUser,
  getUserDisplayName,
  getUserRoleLabel,
  hasPermission,
  logout,
} from '../services/auth.js'
import '../components/ActiveBranchSelect.css'
import './MainLayout.css'

const BRANCH_FILTER_PATHS = ['/dashboard', '/import', '/stock', '/reports', '/users']

const MAIN_NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', permission: 'dashboard.view' },
  { to: '/import', label: 'Import', icon: 'import', permission: 'products.import' },
  { to: '/stock', label: 'Stock', icon: 'stock', permission: 'products.view' },
]

const REPORTS_NAV_ITEMS = [
  { to: '/reports', label: 'Reports', icon: 'reports', permission: 'stock_verification.report' },
]

function filterNavItems(items, user) {
  return items.filter((item) => !item.permission || hasPermission(item.permission, user))
}

const PAGE_META = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Your showroom at a glance' },
  '/import': { title: 'Import', subtitle: 'Upload tag-wise stock Excel file' },
  '/stock': { title: 'Stock', subtitle: 'All products in your showroom' },
  '/reports': { title: 'Reports', subtitle: 'Stock verification by product, counter and status' },
  '/masters': { title: 'Masters', subtitle: 'Setup and administration' },
  '/users': { title: 'Users', subtitle: 'Add, edit and manage user accounts' },
  '/branches': { title: 'Branches', subtitle: 'Add, edit and manage showroom branches' },
  '/roles': { title: 'Roles', subtitle: 'Add, edit and manage roles and permissions' },
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

function renderNavLinks(items, onNavigate) {
  return items.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      className={({ isActive }) =>
        `sidebar-link${isActive ? ' sidebar-link--active' : ''}`
      }
      onClick={onNavigate}
    >
      <span className="sidebar-link__icon">
        <NavIcon name={item.icon} />
      </span>
      <span className="sidebar-link__label">{item.label}</span>
      <span className="sidebar-link__indicator" aria-hidden="true" />
    </NavLink>
  ))
}

export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const user = getUser()
  const mainNavItems = filterNavItems(MAIN_NAV_ITEMS, user)
  const reportsNavItems = filterNavItems(REPORTS_NAV_ITEMS, user)
  const { sessionBranches } = useBranchScope()
  const displayName = getUserDisplayName(user)
  const roleLabel = getUserRoleLabel(user)
  const page = PAGE_META[location.pathname] || PAGE_META['/dashboard']
  const showBranchFilter = BRANCH_FILTER_PATHS.includes(location.pathname)
    && sessionBranches.length > 1
  const isTablePage = location.pathname === '/stock' || location.pathname === '/users' || location.pathname === '/branches' || location.pathname === '/roles'
  const isReportsPage = location.pathname === '/reports'
  const isFillPage = location.pathname === '/import' || isTablePage
  const isWidePage = location.pathname === '/dashboard' || location.pathname === '/masters'
  const isMastersArea = MASTER_PATHS.includes(location.pathname)

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileNavOpen])

  function handleLogout() {
    logout()
    window.location.replace('/login')
  }

  function closeMobileNav() {
    setMobileNavOpen(false)
  }

  function openMasters() {
    navigate('/masters')
  }

  return (
    <div className="app-layout">
      {mobileNavOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={closeMobileNav}
        />
      )}

      <aside className={`sidebar${mobileNavOpen ? ' sidebar--open' : ''}`}>
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
          <button
            type="button"
            className="sidebar-close"
            aria-label="Close menu"
            onClick={closeMobileNav}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="sidebar-nav-wrap">
          <p className="sidebar-menu-label">Main Menu</p>
          <nav className="sidebar-nav">
            {renderNavLinks(mainNavItems, closeMobileNav)}
          </nav>

          {reportsNavItems.length > 0 && (
            <>
              <p className="sidebar-menu-label sidebar-menu-label--reports">Reports</p>
              <nav className="sidebar-nav sidebar-nav--reports">
                {renderNavLinks(reportsNavItems, closeMobileNav)}
              </nav>
            </>
          )}
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
            <button
              type="button"
              className="topbar-menu-btn"
              aria-label="Open menu"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>

            <div className="topbar-headings">
              <h1 className="topbar-title">{page.title}</h1>
              <p className="topbar-subtitle">{page.subtitle}</p>
            </div>
          </div>

          {showBranchFilter && (
            <div className="topbar-branch">
              <ActiveBranchSelect
                branches={sessionBranches}
                alwaysShow
                layout="header"
              />
            </div>
          )}

          <div className="topbar-right">
            <button
              type="button"
              className={`topbar-settings${isMastersArea ? ' topbar-settings--active' : ''}`}
              aria-label="Settings"
              title="Settings"
              onClick={openMasters}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 15a3 3 0 100-6 3 3 0 000 6z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <span className="topbar-divider" aria-hidden="true" />

            <time className="topbar-date" dateTime={new Date().toISOString().slice(0, 10)}>
              {formatToday()}
            </time>

            <span className="topbar-divider" aria-hidden="true" />

            <div className="topbar-user">
              <span className="topbar-user__avatar">{getInitials(displayName)}</span>
              <div className="topbar-user__text">
                <p className="topbar-user__name">{displayName}</p>
                <p className="topbar-user__role">{roleLabel}</p>
              </div>
            </div>

            <button
              type="button"
              className="topbar-logout"
              aria-label="Sign out"
              onClick={handleLogout}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
        </header>

        <main className={`page-content${isTablePage || isReportsPage ? ' page-content--table' : ''}`}>
          <div className={`page-content__inner${isFillPage ? ' page-content__inner--fill' : ''}${isWidePage ? ' page-content__inner--wide' : ''}`}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
