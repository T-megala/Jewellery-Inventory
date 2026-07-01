import { Navigate, Outlet } from 'react-router-dom'
import { isCeo } from '../services/auth.js'

/** Store routes — CEOs are redirected to the executive dashboard. */
export default function RequireStoreAccess() {
  if (isCeo()) {
    return <Navigate to="/dashboard/ceo" replace />
  }

  return <Outlet />
}
