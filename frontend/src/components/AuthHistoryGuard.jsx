import { useEffect, useLayoutEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isSessionValid } from '../services/auth.js'

const GUEST_ONLY_PATHS = new Set(['/', '/login'])

function shouldBlockGuestRoute(pathname) {
  return GUEST_ONLY_PATHS.has(pathname)
}

export default function AuthHistoryGuard() {
  const location = useLocation()
  const navigate = useNavigate()

  useLayoutEffect(() => {
    if (isSessionValid() && shouldBlockGuestRoute(location.pathname)) {
      navigate('/dashboard', { replace: true })
    }
  }, [location.pathname, location.key, navigate])

  useEffect(() => {
    function handlePopState() {
      if (!isSessionValid()) return

      const path = window.location.pathname
      if (shouldBlockGuestRoute(path)) {
        navigate('/dashboard', { replace: true })
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [navigate])

  return null
}
