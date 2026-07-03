import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { isAuthenticated, hasOverallAccess } from '../services/auth.js'

/** Store routes — redirects unauthenticated users to staff login. */
export default function RequireStoreAuth() {
  const location = useLocation()

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (hasOverallAccess()) {
    return <Navigate to="/dashboard/overall" replace />
  }

  return <Outlet />
}
