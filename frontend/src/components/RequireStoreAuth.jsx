import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { isAuthenticated, isCeo } from '../services/auth.js'

/** Store routes — redirects unauthenticated users to staff login. */
export default function RequireStoreAuth() {
  const location = useLocation()

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (isCeo()) {
    return <Navigate to="/dashboard/ceo" replace />
  }

  return <Outlet />
}
