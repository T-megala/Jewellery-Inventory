import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Import from './pages/Import.jsx'
import Stock from './pages/Stock.jsx'
import Reports from './pages/Reports.jsx'
import Users from './pages/Users.jsx'
import Branches from './pages/Branches.jsx'
import MainLayout from './layouts/MainLayout.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import RootRedirect from './components/RootRedirect.jsx'
import { isAuthenticated } from './services/auth.js'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />

      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/import" element={<Import />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/users" element={<Users />} />
          <Route path="/branches" element={<Branches />} />
        </Route>
      </Route>

      <Route
        path="*"
        element={<Navigate to={isAuthenticated() ? '/dashboard' : '/login'} replace />}
      />
    </Routes>
  )
}
