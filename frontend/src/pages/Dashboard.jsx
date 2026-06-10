import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { fetchDashboard, fetchTopSoldProducts } from '../services/dashboard.js'
import './Module.css'
import './Dashboard.css'

const CHART_COLORS = ['#b8860b', '#d4af37', '#c9a227', '#a67c00', '#e8c547', '#9a7209', '#f0c75e', '#8b6914']

function formatCount(value) {
  return Number(value || 0).toLocaleString('en-IN')
}

function truncate(text, max = 18) {
  const str = String(text || '')
  return str.length > max ? `${str.slice(0, max)}…` : str
}

function pct(part, whole) {
  const total = Number(whole)
  if (!total) return '0'
  return ((Number(part) / total) * 100).toFixed(1)
}

function buildPieSlices(rows, valueKey, topN = 6, nameKey = 'name') {
  const sorted = [...rows].sort((a, b) => (b[valueKey] ?? 0) - (a[valueKey] ?? 0))
  const top = sorted.slice(0, topN)
  const rest = sorted.slice(topN)

  const slices = top.map((row) => ({
    name: truncate(row[nameKey], 14),
    fullName: row[nameKey],
    count: row[valueKey] ?? 0,
  }))

  if (rest.length) {
    slices.push({
      name: 'Others',
      fullName: `${rest.length} more`,
      count: rest.reduce((sum, row) => sum + (row[valueKey] ?? 0), 0),
    })
  }

  return slices
}

function ChartTooltip({ active, payload, label, valueLabel = 'sub-products' }) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  const value = payload[0].value
  return (
    <div className="chart-tip">
      <p className="chart-tip__title">{item?.fullName || item?.name || label}</p>
      {item?.product && <p className="chart-tip__meta">Product: {item.product}</p>}
      <p className="chart-tip__value">
        {formatCount(value)}
        {' '}
        {valueLabel}
      </p>
      {item?.productCount != null && (
        <p className="chart-tip__meta">{formatCount(item.productCount)} products</p>
      )}
    </div>
  )
}

function DonutChart({ data, centerTitle, centerValue }) {
  if (!data.length) return <p className="analytics-empty">No data available.</p>

  const total = data.reduce((sum, row) => sum + row.count, 0)

  return (
    <div className="analytics-donut">
      <div className="analytics-donut__chart">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={88}
              paddingAngle={3}
              dataKey="count"
              stroke="#fff"
              strokeWidth={2}
            >
              {data.map((entry, index) => (
                <Cell key={`${entry.fullName}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip valueLabel="sub-products" />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="analytics-donut__center">
          <strong>{centerValue ?? formatCount(total)}</strong>
          <span>{centerTitle}</span>
        </div>
      </div>
      <ul className="analytics-donut__legend">
        {data.map((row, index) => (
          <li key={row.fullName}>
            <span className="analytics-donut__dot" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
            <span className="analytics-donut__name" title={row.fullName}>{row.name}</span>
            <span className="analytics-donut__pct">{pct(row.count, total)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CounterSplitIcon({ type }) {
  if (type === 'safe') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 11V8a4 4 0 118 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 9h18M5 9V19a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function buildCounterSplitRows(byCounter) {
  let showroomCount = 0
  let safeCount = 0

  byCounter.forEach((row) => {
    const count = Number(row.tagCount ?? row.subProductCount ?? 0)
    if (/safe/i.test(String(row.name || ''))) {
      safeCount += count
    } else {
      showroomCount += count
    }
  })

  return [
    {
      key: 'showroom',
      label: 'Showroom stock',
      count: showroomCount,
      variant: 'showroom',
    },
    {
      key: 'safe',
      label: 'Safe stock',
      count: safeCount,
      variant: 'safe',
    },
  ]
}

function CounterSplitChart({ data }) {
  if (!data.length) return <p className="analytics-empty">No counter data available.</p>

  const total = Math.max(...data.map((row) => row.count), 1)

  return (
    <div className="counter-split">
      {data.map((row) => {
        const width = Math.max((row.count / total) * 100, row.count > 0 ? 2 : 0)
        return (
          <div key={row.key} className={`counter-split__row counter-split__row--${row.variant}`}>
            <div className="counter-split__meta">
              <span className={`counter-split__badge counter-split__badge--${row.variant}`}>
                <CounterSplitIcon type={row.variant} />
                {row.label}
              </span>
              <strong className="counter-split__value">{formatCount(row.count)}</strong>
            </div>
            <div className="counter-split__track" aria-hidden="true">
              <span
                className={`counter-split__fill counter-split__fill--${row.variant}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ProductBarChart({ data }) {
  if (!data.length) return <p className="analytics-empty">No data available.</p>

  const max = Math.max(...data.map((row) => row.count), 1)

  return (
    <ul className="product-bar-chart">
      {data.map((row, index) => {
        const width = Math.max((row.count / max) * 100, row.count > 0 ? 3 : 0)
        return (
          <li key={row.fullName} className="product-bar-chart__row">
            <span className="product-bar-chart__rank">{index + 1}</span>
            <span className="product-bar-chart__name" title={row.fullName}>{row.name}</span>
            <div className="product-bar-chart__track" aria-hidden="true">
              <span
                className="product-bar-chart__fill"
                style={{
                  width: `${width}%`,
                  background: `linear-gradient(90deg, ${CHART_COLORS[index % CHART_COLORS.length]}, ${CHART_COLORS[(index + 1) % CHART_COLORS.length]})`,
                }}
              />
            </div>
            <span className="product-bar-chart__value">{formatCount(row.count)}</span>
          </li>
        )
      })}
    </ul>
  )
}

function NavCardIcon({ type }) {
  if (type === 'import') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3v12M8 11l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }
  if (type === 'stock') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7l8-4 8 4-8 4-8-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M4 12l8 4 8-4M4 17l8 4 8-4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19V5M4 19h16M8 15l3-3 3 2 4-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DashboardNavCard({ to, title, label, icon }) {
  return (
    <Link to={to} className="dash-nav-card">
      <span className="dash-nav-card__icon">
        <NavCardIcon type={icon} />
      </span>
      <span className="dash-nav-card__body">
        <span className="dash-nav-card__title">{title}</span>
        <span className="dash-nav-card__label">{label}</span>
      </span>
      <span className="dash-nav-card__arrow" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </Link>
  )
}

function AnalyticsTile({ title, subtitle, children, wide = false }) {
  return (
    <article className={`analytics-tile${wide ? ' analytics-tile--wide' : ''}`}>
      <header className="analytics-tile__head">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </header>
      <div className="analytics-tile__body">{children}</div>
    </article>
  )
}

function StatIcon({ type }) {
  if (type === 'product') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-14L4 7m8 4v10M4 7v10l8 4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === 'subproduct') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7l8-4 8 4-8 4-8-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M4 12l8 4 8-4M4 17l8 4 8-4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === 'pieces') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }
  if (type === 'groups') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7l8-4 8 4-8 4-8-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M4 12l8 4 8-4M4 17l8 4 8-4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === 'counter') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 9h18M5 9V19a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-14L4 7m8 4v10M4 7v10l8 4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function buildStats(totals) {
  return [
    {
      label: 'Total Products',
      value: formatCount(totals.productGroups),
      hint: 'Distinct product groups in stock',
      icon: <StatIcon type="product" />,
    },
    {
      label: 'Total Sub Products',
      value: formatCount(totals.subProducts),
      hint: 'Sub-products across all products',
      icon: <StatIcon type="subproduct" />,
    },
    {
      label: 'Total Tags',
      value: formatCount(totals.totalTags),
      hint: 'Tag / packet rows in active batch',
      icon: <StatIcon type="tags" />,
    },
  ]
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [topSoldProducts, setTopSoldProducts] = useState([])
  const [topSoldNotice, setTopSoldNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [topSoldLoading, setTopSoldLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      try {
        const { inventory } = await fetchDashboard()

        if (!cancelled) {
          setSummary(inventory)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load inventory summary.')
          setSummary(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadTopSold() {
      setTopSoldLoading(true)
      setTopSoldNotice('')

      try {
        const products = await fetchTopSoldProducts()
        if (!cancelled) {
          setTopSoldProducts(products)
          if (!products.length) {
            setTopSoldNotice('No sold products found for the latest batch comparison.')
          }
        }
      } catch (err) {
        if (!cancelled) {
          setTopSoldProducts([])
          setTopSoldNotice(err.message || 'Top sold products are not available yet.')
        }
      } finally {
        if (!cancelled) setTopSoldLoading(false)
      }
    }

    loadTopSold()
    return () => { cancelled = true }
  }, [])

  const totals = summary?.totals ?? {
    totalTags: 0,
    totalPieces: 0,
    totalGrossWt: 0,
    totalNetWt: 0,
    productGroups: 0,
    subProducts: 0,
    counters: 0,
  }

  const stats = buildStats(totals)
  const byProduct = summary?.byProduct ?? []
  const byCounter = summary?.byCounter ?? []
  const batch = summary?.batch
  const productPieData = useMemo(
    () => buildPieSlices(
      byProduct.map((row) => ({ name: row.name, subProductCount: row.subProductCount ?? 0 })),
      'subProductCount',
      6,
      'name',
    ),
    [byProduct],
  )

  const topSoldBarData = useMemo(
    () => topSoldProducts.slice(0, 10).map((row) => ({
      name: truncate(row.productName, 22),
      fullName: row.productName,
      count: row.soldCount ?? 0,
    })),
    [topSoldProducts],
  )

  const counterSplitData = useMemo(
    () => buildCounterSplitRows(byCounter),
    [byCounter],
  )

  if (loading) {
    return (
      <div className="dashboard">
        <p className="dashboard-status">Loading inventory data…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="dashboard-empty">
          <h2>Could not load dashboard</h2>
          <p>{error}</p>
          <p className="dashboard-empty__hint">Make sure the backend is running and stock Excel has been imported.</p>
        </div>
      </div>
    )
  }

  if (!batch || totals.totalTags === 0) {
    return (
      <div className="dashboard">
        <div className="dashboard-empty">
          <h2>No stock data yet</h2>
          <p>Import your Tag Wise Stock Excel file from the Import page to see inventory metrics here.</p>
          <p className="dashboard-empty__hint">
            Expected columns: TranNo, Product, SubProduct, Tag/PacketNo, Pieces, Counter
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      {/* Hero — welcome banner */}
      <section className="dashboard-hero dashboard-hero--welcome">
        <div className="dashboard-hero__bg" aria-hidden="true" />
        <div className="dashboard-hero__overlay" aria-hidden="true" />
        <div className="dashboard-hero__content">
          <span className="dashboard-hero__badge">
            <span className="dashboard-hero__badge-dot" />
            Live Demo Preview
          </span>
          <h2 className="dashboard-hero__title">
            Welcome to <span className="dashboard-hero__brand">Jeyachandran Gold House</span>
          </h2>
          <p className="dashboard-hero__subtitle">
            Your premium jewellery inventory dashboard — track stock, sales, gold rates
            and showroom performance at a glance.
          </p>
        </div>
        <div className="dashboard-hero__rates">
          <p className="dashboard-hero__rates-label">Batch Details</p>
          <div className="dashboard-rate-card">
            <span className="dashboard-rate-card__icon">ID</span>
            <div className="dashboard-rate-card__info">
              <strong>#{batch.id}</strong>
              <span>batch number</span>
            </div>
          </div>
          <div className="dashboard-rate-card">
            <span className="dashboard-rate-card__icon">SP</span>
            <div className="dashboard-rate-card__info">
              <strong>{formatCount(totals.subProducts)}</strong>
              <span>sub-products</span>
            </div>
          </div>
        </div>
      </section>

      {/* Key Metrics */}
      <div className="module-header">
        <div className="module-header__main">
          <h2>Inventory Overview</h2>
        </div>
        <span className="module-header__badge">Live Data</span>
      </div>

      <div className="dashboard-stats">
        {stats.map((stat) => (
          <div key={stat.label} className="dashboard-stat">
            <div className="dashboard-stat__top">
              <div className="dashboard-stat__icon">{stat.icon}</div>
              <p className="dashboard-stat__label">{stat.label}</p>
            </div>
            <p className="dashboard-stat__value">{stat.value}</p>
            <p className="dashboard-stat__hint">{stat.hint}</p>
          </div>
        ))}
      </div>

      {/* Analytics */}
      <section className="dashboard-analytics">
        <div className="module-header">
          <div className="module-header__main">
            <h2>Stock Analytics</h2>
          </div>
        </div>

        <div className="analytics-grid">
          <AnalyticsTile title="Product Mix" subtitle="Sub-product share by product group">
            <DonutChart
              data={productPieData}
              centerTitle="sub-products"
              centerValue={formatCount(totals.subProducts)}
            />
          </AnalyticsTile>

          <AnalyticsTile title="Counter split" subtitle="Tag count in showroom vs safe storage">
            <CounterSplitChart data={counterSplitData} />
          </AnalyticsTile>

          <AnalyticsTile title="Top Sold Products" subtitle="Sold quantity between previous and latest stock import" wide>
            {topSoldLoading && <p className="analytics-empty">Loading sold products…</p>}
            {!topSoldLoading && topSoldNotice && !topSoldBarData.length && (
              <p className="analytics-empty">{topSoldNotice}</p>
            )}
            {!topSoldLoading && topSoldBarData.length > 0 && (
              <ProductBarChart data={topSoldBarData} />
            )}
          </AnalyticsTile>
        </div>
      </section>

      {/* Quick navigation */}
      <section className="dash-nav">
        <div className="module-header">
          <div className="module-header__main">
            <h2>Manage Inventory</h2>
          </div>
        </div>
        <div className="dash-nav__grid">
          <DashboardNavCard
            to="/import"
            title="Import Stock"
            label="Upload tag-wise Excel"
            icon="import"
          />
          <DashboardNavCard
            to="/stock"
            title="View Stock"
            label={`${formatCount(totals.totalTags)} rows · search & browse`}
            icon="stock"
          />
          <DashboardNavCard
            to="/reports"
            title="Verification Reports"
            label="Found, missing & new tags"
            icon="reports"
          />
        </div>
      </section>
    </div>
  )
}
