import { Navigate } from 'react-router-dom'
import { isSessionValid } from '../services/auth.js'

export default function RootRedirect() {
  return (
    <Navigate
      to={isSessionValid() ? '/dashboard' : '/login'}
      replace
    />
  )
}
