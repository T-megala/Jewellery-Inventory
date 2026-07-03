import { Navigate, Outlet } from 'react-router-dom'
import { hasOverallAccess } from '../services/auth.js'

/** Restrict route to overall dashboard users only. */
export default function RequireOverallAccess() {
  if (!hasOverallAccess()) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
