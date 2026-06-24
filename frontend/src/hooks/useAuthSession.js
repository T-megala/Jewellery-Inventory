import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AUTH_SESSION_EVENT, isSessionValid, redirectToLogin } from '../services/auth.js'

export function useAuthSession() {
  const location = useLocation()
  const [tick, setTick] = useState(0)

  useEffect(() => {
    function recheck() {
      setTick((value) => value + 1)
    }

    function handlePageShow(event) {
      recheck()
      if (event.persisted && !isSessionValid()) {
        redirectToLogin()
      }
    }

    window.addEventListener(AUTH_SESSION_EVENT, recheck)
    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('popstate', recheck)
    window.addEventListener('storage', recheck)

    return () => {
      window.removeEventListener(AUTH_SESSION_EVENT, recheck)
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('popstate', recheck)
      window.removeEventListener('storage', recheck)
    }
  }, [])

  useEffect(() => {
    setTick((value) => value + 1)
  }, [location.pathname, location.key])

  return {
    tick,
    isValid: isSessionValid(),
  }
}
