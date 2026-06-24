import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { installAuthNavigationGuards } from '../services/auth.js'

export default function AppShell() {
  useEffect(() => installAuthNavigationGuards(), [])
  return <Outlet />
}
