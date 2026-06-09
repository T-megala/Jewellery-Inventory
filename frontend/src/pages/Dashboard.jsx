import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './Module.css'
import './Dashboard.css'

const STATS = [
  {
    label: 'Total Products',
    value: '248',
    hint: 'Across all counters',
    trend: '+12',
    trendDir: 'up',
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
    trend: '+85g',
    trendDir: 'up',
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
    trend: '+18%',
    trendDir: 'up',
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
    trend: '-2',
    trendDir: 'down',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
]

const GOLD_RATES = [
  { karat: '22K', price: '₹6,245', change: '+₹42' },
  { karat: '24K', price: '₹6,810', change: '+₹48' },
]

const MONTHLY_SALES = [
  { month: 'Jan', sales: 420000, transactions: 38 },
  { month: 'Feb', sales: 385000, transactions: 34 },
  { month: 'Mar', sales: 510000, transactions: 45 },
  { month: 'Apr', sales: 478000, transactions: 41 },
  { month: 'May', sales: 562000, transactions: 52 },
  { month: 'Jun', sales: 84500, transactions: 8 },
]

const CATEGORY_DATA = [
  { name: 'Gold', value: 58, color: '#d4af37' },
  { name: 'Silver', value: 22, color: '#a8a9ad' },
  { name: 'Diamond', value: 14, color: '#60a5fa' },
  { name: 'Platinum', value: 6, color: '#94a3b8' },
]

const COUNTERS = [
  { name: 'Counter A — Bridal', items: 86, max: 100 },
  { name: 'Counter B — Daily Wear', items: 72, max: 100 },
  { name: 'Counter C — Antique', items: 45, max: 100 },
  { name: 'Counter D — Silver', items: 35, max: 100 },
]

const FEATURED_PRODUCTS = [
  { name: '22K Gold Bridal Set', price: '₹1,24,500', stock: 4, image: '/images/necklace.jpg', low: false },
  { name: 'Diamond Stud Earrings', price: '₹38,200', stock: 12, image: '/images/earrings.jpg', low: false },
  { name: 'Antique Gold Bangle', price: '₹56,800', stock: 3, image: '/images/bracelet.jpg', low: true },
  { name: 'Platinum Wedding Ring', price: '₹42,000', stock: 7, image: '/images/ring.jpg', low: false },
]

const RECENT_TRANSACTIONS = [
  { id: 'TXN-1042', product: '22K Gold Chain (18")', customer: 'Priya M.', amount: '₹18,400', time: '10:32 AM', type: 'Gold' },
  { id: 'TXN-1041', product: 'Diamond Pendant', customer: 'Ravi K.', amount: '₹32,500', time: '09:15 AM', type: 'Diamond' },
  { id: 'TXN-1040', product: 'Silver Anklet Pair', customer: 'Walk-in', amount: '₹4,200', time: 'Yesterday', type: 'Silver' },
  { id: 'TXN-1039', product: '24K Coin (8g)', customer: 'Suresh N.', amount: '₹54,480', time: 'Yesterday', type: 'Gold' },
  { id: 'TXN-1038', product: 'Gold Bangle Set', customer: 'Lakshmi R.', amount: '₹67,200', time: 'Yesterday', type: 'Gold' },
]

const MODULES = [
  {
    title: 'Import Stock',
    desc: 'Upload tag-wise Excel files to add new jewellery inventory.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3v12M8 11l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'View Stock',
    desc: 'Browse all showroom products with search and pagination.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7l8-4 8 4-8 4-8-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M4 12l8 4 8-4M4 17l8 4 8-4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Reports',
    desc: 'Stock verification, sales insights and export to PDF/Excel.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 19V5M4 19h16M8 15l3-3 3 2 4-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

function formatSales(value) {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`
  return `₹${value}`
}

function SalesTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e8dfd0',
      borderRadius: '10px',
      padding: '10px 14px',
      boxShadow: '0 4px 16px rgba(60,40,10,0.08)',
      fontSize: '0.82rem',
    }}>
      <p style={{ fontWeight: 600, marginBottom: 4, color: '#2c2116' }}>{label}</p>
      <p style={{ color: '#b8860b', fontWeight: 700 }}>{formatSales(payload[0].value)}</p>
      <p style={{ color: '#7a6e62', fontSize: '0.75rem' }}>{payload[0].payload.transactions} transactions</p>
    </div>
  )
}

function CategoryTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e8dfd0',
      borderRadius: '10px',
      padding: '8px 12px',
      boxShadow: '0 4px 16px rgba(60,40,10,0.08)',
      fontSize: '0.82rem',
      fontWeight: 600,
      color: '#2c2116',
    }}>
      {payload[0].name}: {payload[0].value}%
    </div>
  )
}

function TrendIcon({ dir }) {
  if (dir === 'up') {
    return (
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M6 2v8M3 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (dir === 'down') {
    return (
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M6 10V2M3 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return null
}

export default function Dashboard() {
  return (
    <div className="dashboard">
      {/* Hero Banner */}
      <section className="dashboard-hero">
        <div className="dashboard-hero__bg" aria-hidden="true" />
        <div className="dashboard-hero__overlay" aria-hidden="true" />
        <div className="dashboard-hero__content">
          <span className="dashboard-hero__badge">
            <span className="dashboard-hero__badge-dot" />
            Live Demo Preview
          </span>
          <h2 className="dashboard-hero__title">
            Welcome to <span>Jeyachandran Gold House</span>
          </h2>
          <p className="dashboard-hero__subtitle">
            Your premium jewellery inventory dashboard — track stock, sales, gold rates
            and showroom performance at a glance.
          </p>
        </div>
        <div className="dashboard-hero__rates">
          <p className="dashboard-hero__rates-label">Today&apos;s Gold Rate / gram</p>
          {GOLD_RATES.map((rate) => (
            <div key={rate.karat} className="dashboard-rate-card">
              <span className="dashboard-rate-card__icon">{rate.karat}</span>
              <div className="dashboard-rate-card__info">
                <strong>{rate.price}</strong>
                <span>per gram</span>
              </div>
              <span className="dashboard-rate-card__change">{rate.change}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Key Metrics */}
      <div className="module-header">
        <div className="module-header__main">
          <h2>Key Metrics</h2>
          <p>Live overview of showroom inventory and sales</p>
        </div>
        <span className="module-header__badge">Demo Data</span>
      </div>

      <div className="dashboard-stats">
        {STATS.map((stat) => (
          <div key={stat.label} className="dashboard-stat">
            <div className="dashboard-stat__top">
              <div className="dashboard-stat__icon">{stat.icon}</div>
              <span className={`dashboard-stat__trend dashboard-stat__trend--${stat.trendDir}`}>
                <TrendIcon dir={stat.trendDir} />
                {stat.trend}
              </span>
            </div>
            <div>
              <p className="dashboard-stat__label">{stat.label}</p>
              <strong className="dashboard-stat__value">{stat.value}</strong>
              <span className="dashboard-stat__hint">{stat.hint}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="dashboard-grid dashboard-grid--2">
        <div className="dashboard-chart-card">
          <div className="dashboard-chart-card__head">
            <div>
              <h3>Monthly Sales</h3>
              <p>Revenue trend across the showroom</p>
            </div>
            <span className="dashboard-chart-card__tag">2026</span>
          </div>
          <div className="dashboard-chart-card__body">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={MONTHLY_SALES} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d4af37" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#d4af37" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe3" vertical={false} />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#7a6e62', fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#7a6e62', fontSize: 11 }}
                  tickFormatter={(v) => formatSales(v)}
                  width={52}
                />
                <Tooltip content={<SalesTooltip />} />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#b8860b"
                  strokeWidth={2.5}
                  fill="url(#salesGradient)"
                  dot={{ fill: '#b8860b', strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 6, fill: '#d4af37', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="dashboard-chart-card">
          <div className="dashboard-chart-card__head">
            <div>
              <h3>Inventory Mix</h3>
              <p>Stock distribution by category</p>
            </div>
            <span className="dashboard-chart-card__tag">248 items</span>
          </div>
          <div className="dashboard-chart-card__body dashboard-chart-card__body--compact">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={CATEGORY_DATA}
                  cx="50%"
                  cy="50%"
                  innerRadius={62}
                  outerRadius={95}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {CATEGORY_DATA.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CategoryTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '16px',
              flexWrap: 'wrap',
              padding: '0 16px 8px',
            }}>
              {CATEGORY_DATA.map((cat) => (
                <span key={cat.name} style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: '#7a6e62',
                }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: cat.color,
                    flexShrink: 0,
                  }} />
                  {cat.name} {cat.value}%
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="dashboard-grid dashboard-grid--2">
        <div className="dashboard-chart-card">
          <div className="dashboard-chart-card__head">
            <div>
              <h3>Counter-wise Stock</h3>
              <p>Items available per showroom counter</p>
            </div>
            <span className="dashboard-chart-card__tag">238 in stock</span>
          </div>
          <div className="dashboard-counters">
            {COUNTERS.map((counter) => (
              <div key={counter.name} className="dashboard-counter">
                <div className="dashboard-counter__head">
                  <span className="dashboard-counter__name">{counter.name}</span>
                  <span className="dashboard-counter__value">{counter.items} items</span>
                </div>
                <div className="dashboard-counter__bar">
                  <div
                    className="dashboard-counter__fill"
                    style={{ width: `${(counter.items / counter.max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="dashboard-chart-card">
          <div className="dashboard-chart-card__head">
            <div>
              <h3>Featured Collection</h3>
              <p>Top showroom pieces this week</p>
            </div>
            <span className="dashboard-chart-card__tag">Premium</span>
          </div>
          <div className="dashboard-featured">
            {FEATURED_PRODUCTS.map((product) => (
              <article key={product.name} className="dashboard-product">
                <img
                  src={product.image}
                  alt={product.name}
                  className="dashboard-product__img"
                  loading="lazy"
                />
                <div className="dashboard-product__info">
                  <p className="dashboard-product__name">{product.name}</p>
                  <div className="dashboard-product__meta">
                    <span className="dashboard-product__price">{product.price}</span>
                    <span className={`dashboard-product__stock${product.low ? ' dashboard-product__stock--low' : ''}`}>
                      {product.low ? 'Low stock' : `${product.stock} in stock`}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="panel-card" style={{ marginBottom: 28 }}>
        <div className="panel-card__head">
          <div>
            <h2>Recent Transactions</h2>
            <p>Latest sales activity in your showroom</p>
          </div>
          <span className="dashboard-chart-card__tag">Today &amp; yesterday</span>
        </div>
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Product</th>
                <th>Customer</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {RECENT_TRANSACTIONS.map((txn) => (
                <tr key={txn.id}>
                  <td><code>{txn.id}</code></td>
                  <td>{txn.product}</td>
                  <td>{txn.customer}</td>
                  <td>
                    <span className={`badge badge--${txn.type.toLowerCase() === 'gold' ? 'gold' : txn.type.toLowerCase() === 'silver' ? 'silver' : 'diamond'}`}>
                      {txn.type}
                    </span>
                  </td>
                  <td className="dashboard-table__amount">{txn.amount}</td>
                  <td>{txn.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Modules */}
      <div className="panel-card">
        <div className="panel-card__head">
          <div>
            <h2>Quick Summary</h2>
            <p>Everything you need to manage Jeyachandran Gold House inventory.</p>
          </div>
        </div>
        <div className="panel-card__body">
          <div className="dashboard-modules">
            {MODULES.map((mod) => (
              <div key={mod.title} className="dashboard-module">
                <span className="dashboard-module__icon">{mod.icon}</span>
                <div>
                  <p className="dashboard-module__title">{mod.title}</p>
                  <p className="dashboard-module__desc">{mod.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 20, fontSize: '0.84rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
            This dashboard uses <strong>demo data</strong> for client preview. All metrics, charts and
            transactions will connect to your backend API when integrated.
          </p>
        </div>
      </div>
    </div>
  )
}
