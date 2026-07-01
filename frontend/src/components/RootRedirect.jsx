import { Navigate } from 'react-router-dom'
import { getPostLoginPath, isAuthenticated } from '../services/auth.js'

export default function RootRedirect() {
  return <Navigate to={isAuthenticated() ? getPostLoginPath() : '/login'} replace />
}
