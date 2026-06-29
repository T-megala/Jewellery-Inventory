import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import {
  beginLogout,
  installAuthNavigationGuards,
  isLogoutInProgress,
} from '../services/auth.js'

const LOGIN_PATH = '/login'

export default function AppShell() {
  useEffect(() => installAuthNavigationGuards(), [])

  useEffect(() => {
    if (!isLogoutInProgress()) return

    beginLogout()

    if (!window.location.pathname.endsWith(LOGIN_PATH)) {
      window.location.href = LOGIN_PATH
    }
  }, [])

  return <Outlet />
}
