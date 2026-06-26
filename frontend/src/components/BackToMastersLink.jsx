import { Link } from 'react-router-dom'
import './BackToMastersLink.css'

export default function BackToMastersLink() {
  return (
    <nav className="masters-back-nav" aria-label="Back navigation">
      <Link to="/masters" className="masters-back-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Masters
      </Link>
    </nav>
  )
}
