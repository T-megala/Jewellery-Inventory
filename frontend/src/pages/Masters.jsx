import { Link } from 'react-router-dom'
import { MASTER_GROUPS } from '../config/masters.js'
import {
  getUser,
  getActiveBranch,
  getUserDisplayName,
  getUserRoleLabel,
  hasAnyPermission,
} from '../services/auth.js'
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
      <div className="masters-card masters-card--disabled" aria-disabled="true">
        {content}
      </div>
    )
  }

  return (
    <Link to={item.to} className="masters-card">
      {content}
    </Link>
  )
}

export default function Masters() {
  const user = getUser()
  const currentBranch = getActiveBranch(user)
  const displayName = getUserDisplayName(user)
  const roleLabel = getUserRoleLabel(user)

  const visibleGroups = MASTER_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasAnyPermission(item.permissions, user)),
  })).filter((group) => group.items.length > 0)

  const hasMasters = visibleGroups.length > 0

  return (
    <div className="masters-page">
      <section className="masters-hero">
        <div className="masters-hero__content">
          <p className="masters-hero__eyebrow">Setup & administration</p>
          <h2 className="masters-hero__title">Masters</h2>
          <p className="masters-hero__text">
            Manage organization and access settings for {displayName}.
          </p>
        </div>

        <div className="masters-hero__meta">
          <div className="masters-meta-card">
            <span className="masters-meta-card__label">Signed in as</span>
            <strong>{displayName}</strong>
            <small>{roleLabel}</small>
          </div>

          {currentBranch?.name && (
            <div className="masters-meta-card masters-meta-card--branch">
              <span className="masters-meta-card__label">Current branch</span>
              <strong>{currentBranch.name}</strong>
            </div>
          )}
        </div>
      </section>

      {!hasMasters && (
        <section className="masters-empty">
          <p>No master screens are available for your account.</p>
        </section>
      )}

      {visibleGroups.map((group) => (
        <section key={group.id} className="masters-group">
          <h3 className="masters-group__title">{group.title}</h3>
          <div className="masters-group__grid">
            {group.items.map((item) => (
              <MasterCard key={item.to} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
