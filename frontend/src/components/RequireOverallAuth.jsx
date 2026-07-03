import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { hasOverallAccess, isAuthenticated } from '../services/auth.js'

/** Overall dashboard routes — redirects unauthenticated users to executive login. */
export default function RequireOverallAuth() {
  const location = useLocation()

  if (!isAuthenticated()) {
    return <Navigate to="/overalldashboard/login" replace state={{ from: location }} />
  }

  if (!hasOverallAccess()) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
