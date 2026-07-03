import { Navigate, Outlet } from 'react-router-dom'
import { hasOverallAccess } from '../services/auth.js'

/** Store routes — overall dashboard users are redirected to the overall dashboard. */
export default function RequireStoreAccess() {
  if (hasOverallAccess()) {
    return <Navigate to="/overalldashboard" replace />
  }

  return <Outlet />
}
