import { Navigate, Outlet, useLocation } from 'react-router-dom'
import {
  hasPendingBranchSelection,
  isAuthenticated,
  needsBranchSelection,
} from '../services/auth.js'

export default function RequireAuth() {
  const location = useLocation()

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (hasPendingBranchSelection() && needsBranchSelection()) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
