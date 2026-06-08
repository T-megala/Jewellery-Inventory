import { useNavigate } from 'react-router-dom'
import { getUser, logout } from '../services/auth.js'
import './Dashboard.css'

export default function Dashboard() {
  const navigate = useNavigate()
  const user = getUser()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <img
            src="/images/logo.png"
            alt="Jeyachandran Gold House"
            className="brand-logo"
          />
          <span>Jeyachandran Gold House</span>
        </div>
        <div className="dashboard-user">
          <span>{user?.name || user?.username}</span>
          <button type="button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <h1>Welcome, {user?.name || 'User'}!</h1>
        <p className="dashboard-subtitle">
          Dashboard placeholder — inventory features will be added here.
        </p>
      </main>
    </div>
  )
}
