import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { isAuthenticated, isCeo } from '../services/auth.js'

/** CEO routes — redirects unauthenticated users to executive login. */
export default function RequireCeoAuth() {
  const location = useLocation()

  if (!isAuthenticated()) {
    return <Navigate to="/login/ceo" replace state={{ from: location }} />
  }

  if (!isCeo()) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
