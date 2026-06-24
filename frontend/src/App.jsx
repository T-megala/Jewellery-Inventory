import { Routes, Route, Navigate } from 'react-router-dom'
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
import AuthHistoryGuard from './components/AuthHistoryGuard.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import RequireGuest from './components/RequireGuest.jsx'
import RootRedirect from './components/RootRedirect.jsx'
import { isSessionValid } from './services/auth.js'

export default function App() {
  return (
    <>
      <AuthHistoryGuard />
      <Routes>
        <Route path="/" element={<RootRedirect />} />

        <Route element={<RequireGuest />}>
          <Route path="/login" element={<Login />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/import" element={<Import />} />
            <Route path="/stock" element={<Stock />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/masters" element={<Masters />} />
            <Route path="/users" element={<Users />} />
            <Route path="/branches" element={<Branches />} />
            <Route path="/roles" element={<Roles />} />
          </Route>
        </Route>

        <Route
          path="*"
          element={<Navigate to={isSessionValid() ? '/dashboard' : '/login'} replace />}
        />
      </Routes>
    </>
  )
}
