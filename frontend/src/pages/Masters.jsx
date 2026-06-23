import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MASTER_GROUPS } from '../config/masters.js'
import { getUser, hasAnyPermission } from '../services/auth.js'
import './Masters.css'

function MasterIcon({ name }) {
  if (name === 'branches') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 21h18M5 21V7l7-4 7 4v14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 21v-6h6v6M10 10h4M10 13h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'users') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8" />
        <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l7 4v5c0 4.2-2.8 7.8-7 9-4.2-1.2-7-4.8-7-9V7l7-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MasterCard({ item }) {
  const content = (
    <>
      <span className="masters-card__icon">
        <MasterIcon name={item.icon} />
      </span>
      <span className="masters-card__text">
        <strong>{item.label}</strong>
        <small>{item.description}</small>
      </span>
      {item.comingSoon ? (
        <span className="masters-card__badge">Coming soon</span>
      ) : (
        <svg className="masters-card__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </>
  )

  if (item.comingSoon) {
    return (
      <div className={`masters-card masters-card--${item.icon} masters-card--disabled`} aria-disabled="true">
        {content}
      </div>
    )
  }

  return (
    <Link to={item.to} className={`masters-card masters-card--${item.icon}`}>
      {content}
    </Link>
  )
}

function filterMasterGroups(groups, searchInput) {
  const term = searchInput.trim().toLowerCase()
  if (!term) return groups

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => (
        [item.label, item.description, group.title]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(term)
      )),
    }))
    .filter((group) => group.items.length > 0)
}

export default function Masters() {
  const [searchInput, setSearchInput] = useState('')
  const user = getUser()

  const visibleGroups = MASTER_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasAnyPermission(item.permissions, user)),
    }))
    .filter((group) => group.items.length > 0)

  const filteredGroups = useMemo(
    () => filterMasterGroups(visibleGroups, searchInput),
    [visibleGroups, searchInput],
  )

  const moduleCount = visibleGroups.reduce((total, group) => total + group.items.length, 0)
  const visibleCount = filteredGroups.reduce((total, group) => total + group.items.length, 0)
  const isSearchActive = searchInput.trim().length > 0
  const hasMasters = visibleGroups.length > 0

  return (
    <div className="masters-page">
      <section className="masters-panel">
        <header className="masters-panel__head">
          <div className="masters-panel__intro">
            <div className="masters-panel__title-row">
              <span className="masters-panel__accent" aria-hidden="true" />
              <div>
                <h2 className="masters-panel__title">Admin modules</h2>
                <p className="masters-panel__text">
                  Manage organization structure, staff access, and permission roles.
                </p>
              </div>
            </div>
            <span className="masters-panel__count">
              {moduleCount}
              {' '}
              module
              {moduleCount === 1 ? '' : 's'}
            </span>
          </div>

          {hasMasters && (
            <div className="masters-search">
              <span className="masters-search__icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search branches, users, roles…"
                aria-label="Search admin modules"
              />
              {isSearchActive && (
                <button
                  type="button"
                  className="masters-search__clear"
                  onClick={() => setSearchInput('')}
                  aria-label="Clear search"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </header>

        <div className="masters-panel__body">
          {!hasMasters && (
            <div className="masters-empty">
              <p>No master screens are available for your account.</p>
            </div>
          )}

          {hasMasters && isSearchActive && filteredGroups.length === 0 && (
            <div className="masters-empty masters-empty--search">
              <p>
                No modules match
                {' '}
                <strong>{searchInput.trim()}</strong>
                .
              </p>
            </div>
          )}

          {hasMasters && filteredGroups.length > 0 && (
            <>
              {isSearchActive && (
                <p className="masters-panel__results">
                  {visibleCount}
                  {' '}
                  module
                  {visibleCount === 1 ? '' : 's'}
                  {' '}
                  found
                </p>
              )}

              {filteredGroups.map((group, index) => (
                <section key={group.id} className="masters-group">
                  {index > 0 && <div className="masters-group__divider" aria-hidden="true" />}
                  <h3 className="masters-group__title">{group.title}</h3>
                  <div className={`masters-group__grid${group.items.length === 1 ? ' masters-group__grid--single' : ''}`}>
                    {group.items.map((item) => (
                      <MasterCard key={item.to} item={item} />
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
