import { useLayoutEffect } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useAuthSession } from '../hooks/useAuthSession.js'

export default function RequireGuest() {
  const navigate = useNavigate()
  const { isValid, tick } = useAuthSession()

  useLayoutEffect(() => {
    if (isValid) {
      navigate('/dashboard', { replace: true })
    }
  }, [isValid, navigate])

  if (isValid) {
    return <Navigate to="/dashboard" replace key={`guest-redirect-${tick}`} />
  }

  return <Outlet key={`guest-ok-${tick}`} />
}
