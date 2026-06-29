import { createBrowserRouter, redirect } from 'react-router-dom'
import { isSessionValid, clearAuthSession } from './services/auth.js'
import AppShell from './components/AppShell.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Import from './pages/Import.jsx'
import Stock from './pages/Stock.jsx'
import Reports from './pages/Reports.jsx'
import Users from './pages/Users.jsx'
import Branches from './pages/Branches.jsx'
import Masters from './pages/Masters.jsx'
import Roles from './pages/Roles.jsx'
import MainLayout from './layouts/MainLayout.jsx'

function requireAuthLoader() {
  if (isSessionValid()) return null
  return redirect('/login')
}

/** Visiting /login clears the session — only place logout cleanup runs. */
function loginLoader() {
  clearAuthSession({ notify: false })
  return null
}

function rootRedirectLoader() {
  return redirect(isSessionValid() ? '/dashboard' : '/login')
}

function catchAllLoader() {
  return redirect(isSessionValid() ? '/dashboard' : '/login')
}

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      {
        index: true,
        loader: rootRedirectLoader,
      },
      {
        path: 'login',
        loader: loginLoader,
        element: <Login />,
      },
      {
        loader: requireAuthLoader,
        element: <MainLayout />,
        children: [
          { path: 'dashboard', element: <Dashboard /> },
          { path: 'import', element: <Import /> },
          { path: 'stock', element: <Stock /> },
          { path: 'reports', element: <Reports /> },
          { path: 'masters', element: <Masters /> },
          { path: 'users', element: <Users /> },
          { path: 'branches', element: <Branches /> },
          { path: 'roles', element: <Roles /> },
        ],
      },
      {
        path: '*',
        loader: catchAllLoader,
      },
    ],
  },
])
