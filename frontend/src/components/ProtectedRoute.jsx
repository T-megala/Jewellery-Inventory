import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthSession } from '../hooks/useAuthSession.js'
import { isSessionValid, redirectToLogin } from '../services/auth.js'

const LOGIN_PATH = '/login'

/**
 * Guards private routes. Unauthenticated users (including browser forward/back)
 * are redirected to login before child routes render.
 */
export default function ProtectedRoute() {
  const location = useLocation()
  const { isValid, tick } = useAuthSession()

  useEffect(() => {
    function handlePageShow(event) {
      if (!event.persisted) return

      if (!isSessionValid()) {
        redirectToLogin()
        return
      }

      window.location.reload()
    }

    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  if (!isValid) {
    return (
      <Navigate
        to={LOGIN_PATH}
        replace
        state={{ from: location }}
        key={`protected-denied-${tick}`}
      />
    )
  }

  return <Outlet key={`protected-ok-${tick}`} />
}
