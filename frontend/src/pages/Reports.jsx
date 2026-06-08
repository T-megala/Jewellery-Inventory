import './Module.css'

const STATS = [
  {
    label: 'This Month Sales',
    value: '₹12.4L',
    hint: '+18% vs last month',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Gold Sold',
    value: '342g',
    hint: 'Across all categories',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    label: 'Transactions',
    value: '186',
    hint: 'This month',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 19V5M4 19h16M8 15l3-3 3 2 4-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Avg. Bill',
    value: '₹6,670',
    hint: 'Per transaction',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
]

const REPORTS = [
  { name: 'Daily Sales Report', desc: 'Sales summary for today' },
  { name: 'Stock Summary', desc: 'Current inventory by category' },
  { name: 'Gold Rate Report', desc: 'Gold price history and trends' },
  { name: 'Low Stock Alert', desc: 'Products below minimum quantity' },
]

export default function Reports() {
  return (
    <div className="module-page">
      <div className="module-header">
        <div className="module-header__main">
          <h2>Business Reports</h2>
          <p>Sales performance and inventory analytics</p>
        </div>
        <span className="module-header__badge">June 2026</span>
      </div>

      <div className="stat-grid">
        {STATS.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="stat-card__icon">{stat.icon}</div>
            <div className="stat-card__body">
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
              <span>{stat.hint}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="panel-card">
        <div className="panel-card__head">
          <div>
            <h2>Available Reports</h2>
            <p>Select a report to view — export to PDF or Excel when backend is connected.</p>
          </div>
        </div>
        <div className="panel-card__body">
          <div className="report-list">
            {REPORTS.map((report) => (
              <div key={report.name} className="report-item">
                <div className="report-item__icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <p className="report-item__name">{report.name}</p>
                  <p className="report-item__desc">{report.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
