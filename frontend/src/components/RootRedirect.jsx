import { Navigate } from 'react-router-dom'
import { isAuthenticated } from '../services/auth.js'

export default function RootRedirect() {
  return <Navigate to={isAuthenticated() ? '/dashboard' : '/login'} replace />
}
