import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import OverallLogin from './pages/OverallLogin.jsx'
import Dashboard from './pages/Dashboard.jsx'
import OverallDashboard from './pages/OverallDashboard.jsx'
import Import from './pages/Import.jsx'
import Stock from './pages/Stock.jsx'
import Reports from './pages/Reports.jsx'
import Users from './pages/Users.jsx'
import MainLayout from './layouts/MainLayout.jsx'
import ExecutiveLayout from './layouts/ExecutiveLayout.jsx'
import RequireOverallAuth from './components/RequireOverallAuth.jsx'
import RequireStoreAuth from './components/RequireStoreAuth.jsx'
import RootRedirect from './components/RootRedirect.jsx'
import { getPostLoginPath, isAuthenticated } from './services/auth.js'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />

      <Route path="/login" element={<Login />} />
      <Route path="/overalldashboard/login" element={<OverallLogin />} />
      <Route path="/login/overall" element={<Navigate to="/overalldashboard/login" replace />} />
      <Route path="/login/ceo" element={<Navigate to="/overalldashboard/login" replace />} />

      <Route element={<RequireOverallAuth />}>
        <Route element={<ExecutiveLayout />}>
          <Route path="/overalldashboard" element={<OverallDashboard />} />
        </Route>
      </Route>
      <Route path="/dashboard/overall" element={<Navigate to="/overalldashboard" replace />} />
      <Route path="/dashboard/ceo" element={<Navigate to="/overalldashboard" replace />} />

      <Route element={<RequireStoreAuth />}>
        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/import" element={<Import />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/users" element={<Users />} />
        </Route>
      </Route>

      <Route
        path="*"
        element={<Navigate to={isAuthenticated() ? getPostLoginPath() : '/login'} replace />}
      />
    </Routes>
  )
}
