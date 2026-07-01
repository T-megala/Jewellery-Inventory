import { Navigate, Outlet } from 'react-router-dom'
import { isCeo } from '../services/auth.js'

/** Restrict route to CEO users only. */
export default function RequireCeo() {
  if (!isCeo()) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
