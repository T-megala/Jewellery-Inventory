import './Module.css'

const STATS = [
  {
    label: 'Total Products',
    value: '248',
    hint: '+12 this month',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-14L4 7m8 4v10M4 7v10l8 4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Gold Stock',
    value: '1,420g',
    hint: '22K & 24K combined',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Today's Sales",
    value: '₹84,500',
    hint: '8 transactions',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Low Stock',
    value: '6',
    hint: 'Needs attention',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
]

export default function Dashboard() {
  return (
    <div className="module-page">
      <div className="module-header">
        <div className="module-header__main">
          <h2>Key Metrics</h2>
          <p>Live overview of showroom inventory and sales</p>
        </div>
        <span className="module-header__badge">Live Demo</span>
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
            <h2>Quick Summary</h2>
            <p>Everything you need to manage Jeyachandran Gold House inventory.</p>
          </div>
        </div>
        <div className="panel-card__body">
          <p>
            Use <strong>Import</strong> to add new jewellery, <strong>Stock</strong> to view
            showroom products, and <strong>Reports</strong> for sales and gold rate insights.
            All modules will connect to your backend when ready.
          </p>
        </div>
      </div>
    </div>
  )
}
