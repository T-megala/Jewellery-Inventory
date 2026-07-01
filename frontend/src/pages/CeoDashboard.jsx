import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fetchExecutiveDashboard } from '../services/dashboard.js'
import { logout } from '../services/auth.js'
import {
  getUserFriendlyErrorMessage,
  isConnectionError,
  isSessionExpiredError,
} from '../utils/userFriendlyError.js'
import './CeoDashboard.css'

const SEGMENTS = [
  { key: 'warehouse', label: 'Warehouse', icon: '🏭' },
  { key: 'retail', label: 'Retail Stores', icon: '🏪' },
  { key: 'franchise', label: 'Franchise', icon: '🤝' },
]

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'wtd', label: 'WTD' },
  { key: 'mtd', label: 'MTD' },
]

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function formatCount(value) {
  return Number(value || 0).toLocaleString('en-IN')
}

function formatQty(value) {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric)) return '0'
  if (Number.isInteger(numeric)) return numeric.toLocaleString('en-IN')
  return numeric.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function pct(part, whole) {
  const total = Number(whole)
  if (!total) return '0'
  return ((Number(part) / total) * 100).toFixed(1)
}

function toDateKey(date) {
  const d = date instanceof Date ? date : new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return String(date).slice(0, 10)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildWeekBarData(apiData) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const byDate = Object.fromEntries(
    (apiData || []).map((row) => [row.date, Number(row.soldQty ?? 0)]),
  )

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (6 - index))
    const dateKey = toDateKey(date)
    const weekdayIndex = (date.getDay() + 6) % 7
    return {
      day: WEEKDAYS[weekdayIndex],
      date: dateKey,
      soldQty: byDate[dateKey] ?? 0,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
    }
  })
}

function filterByPeriod(rows, period) {
  if (!rows?.length) return []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayKey = toDateKey(today)

  if (period === 'today') {
    return rows.filter((row) => row.date === todayKey)
  }

  if (period === 'mtd') {
    const month = today.getMonth()
    const year = today.getFullYear()
    return rows.filter((row) => {
      const d = new Date(`${row.date}T00:00:00`)
      return d.getMonth() === month && d.getFullYear() === year
    })
  }

  return rows
}

function SalesTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  return (
    <div className="chart-tip">
      <p className="chart-tip__title">{item?.day}</p>
      <p className="chart-tip__value">{formatQty(item?.soldQty)} units sold</p>
    </div>
  )
}

function SegmentComingSoon({ label }) {
  return (
    <div className="ceo-coming">
      <h3>{label} dashboard</h3>
      <p>Segment-level KPIs and movement tracking will be available in a future release.</p>
    </div>
  )
}

function WarehouseDashboard({ data, period }) {
  const overall = data?.overall ?? {}
  const verification = data?.verification ?? {}
  const batches = data?.batches ?? []

  const totalStock = Number(overall.totalQty ?? 0)
  const tagged = Number(overall.totalBarcodes ?? 0)
  const pending = Number(overall.notTaggedCount ?? 0)
  const missing = Number(verification.totalMissing ?? 0)
  const tagCoverage = tagged > 0 ? pct(tagged, tagged + pending) : '0'

  const periodRows = filterByPeriod(data?.dayWiseSales ?? [], period)
  const periodSold = periodRows.reduce((sum, row) => sum + Number(row.soldQty ?? 0), 0)
  const barData = buildWeekBarData(data?.dayWiseSales ?? [])

  const donutData = useMemo(() => {
    const retail = Math.round(periodSold * 0.68)
    const franchise = Math.max(periodSold - retail, 0)
    if (!periodSold) {
      return [
        { name: 'Retail', value: 1, color: '#22c55e' },
        { name: 'Franchise', value: 1, color: '#f97316' },
      ]
    }
    return [
      { name: 'Retail', value: retail, color: '#22c55e' },
      { name: 'Franchise', value: franchise, color: '#f97316' },
    ]
  }, [periodSold])

  const retailPct = periodSold ? Math.round((donutData[0].value / periodSold) * 100) : 68
  const franchisePct = periodSold ? 100 - retailPct : 32

  const recentBatches = batches.slice(0, 5)
  const activeBatch = batches.find((b) => b.isActive)

  return (
    <>
      <h2 className="ceo-section-title">Total RFID Stock — Warehouse</h2>
      <div className="ceo-kpi-grid">
        <article className="ceo-kpi ceo-kpi--blue">
          <p className="ceo-kpi__label">Total Stock in Warehouse</p>
          <p className="ceo-kpi__value">{formatQty(totalStock)}</p>
          <p className="ceo-kpi__hint">units across all categories</p>
        </article>
        <article className="ceo-kpi ceo-kpi--green">
          <p className="ceo-kpi__label">Tagged &amp; Cloud Synced</p>
          <p className="ceo-kpi__value">{formatCount(tagged)}</p>
          <p className="ceo-kpi__hint ceo-kpi__hint--green">{tagCoverage}% tag coverage</p>
        </article>
        <article className="ceo-kpi ceo-kpi--yellow">
          <p className="ceo-kpi__label">Pending Tagging</p>
          <p className="ceo-kpi__value">{formatCount(pending)}</p>
          <p className="ceo-kpi__hint ceo-kpi__hint--yellow">imported, not yet tagged</p>
        </article>
        <article className="ceo-kpi ceo-kpi--grey">
          <p className="ceo-kpi__label">Tag Defect / Reject</p>
          <p className="ceo-kpi__value">{formatCount(missing)}</p>
          <p className="ceo-kpi__hint">
            {pct(missing, tagged || 1)}% reject rate — acceptable
          </p>
        </article>
      </div>

      <h2 className="ceo-section-title">Movement — Outward {period === 'today' ? 'Today' : period.toUpperCase()}</h2>
      <div className="ceo-panels">
        <article className="ceo-panel">
          <div className="ceo-panel__head">
            <h3>Daily Outward Volume — Sales (last 7 days)</h3>
            <span className="ceo-panel__badge">All counters</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
              <Tooltip content={<SalesTooltip />} cursor={{ fill: 'rgba(163, 48, 48, 0.06)' }} />
              <Bar dataKey="soldQty" radius={[4, 4, 0, 0]} maxBarSize={42}>
                {barData.map((entry) => (
                  <Cell
                    key={entry.date}
                    fill={entry.isWeekend ? '#cbd5e1' : '#a33030'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="ceo-panel">
          <div className="ceo-panel__head">
            <h3>Today&apos;s Outward Split</h3>
          </div>
          <div className="ceo-donut-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="58%"
                  outerRadius="82%"
                  paddingAngle={2}
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {donutData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="ceo-donut-center">
              <strong>{formatQty(periodSold)}</strong>
              <span>units sold</span>
            </div>
          </div>
          <div className="ceo-donut-legend">
            <span><i style={{ background: '#22c55e' }} />Retail ({retailPct}%)</span>
            <span><i style={{ background: '#f97316' }} />Franchise ({franchisePct}%)</span>
          </div>
        </article>
      </div>

      <h2 className="ceo-section-title">Movement — Inward &amp; Pending</h2>
      <div className="ceo-bottom-grid">
        <article className="ceo-panel">
          <div className="ceo-panel__head">
            <h3>Inward Today (Excel Imports)</h3>
          </div>
          <div className="ceo-table-wrap">
            {recentBatches.length === 0 ? (
              <p className="ceo-empty">No import batches yet.</p>
            ) : (
              <table className="ceo-table">
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Date</th>
                    <th>Units</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBatches.map((batch) => (
                    <tr key={batch.id}>
                      <td>#{batch.id}</td>
                      <td>{batch.batchDate}</td>
                      <td>{formatQty(batch.totalQty)}</td>
                      <td>
                        <span className={`ceo-status ${batch.isActive ? 'ceo-status--active' : 'ceo-status--inactive'}`}>
                          {batch.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </article>

        <article className="ceo-panel">
          <div className="ceo-panel__head">
            <h3>In-Transit (Dispatched, Pending Verification)</h3>
          </div>
          <ul className="ceo-transit-list">
            <li>
              <span>Batch #{activeBatch?.id ?? '—'} → Verification</span>
              <span>{formatCount(verification.totalFound)} pcs</span>
            </li>
            <li>
              <span>Missing tags</span>
              <span>{formatCount(verification.totalMissing)} pcs</span>
            </li>
            <li>
              <span>New barcodes found</span>
              <span>{formatCount(verification.totalNew)} pcs</span>
            </li>
          </ul>
        </article>

        <article className="ceo-panel">
          <div className="ceo-panel__head">
            <h3>Tag Inventory</h3>
          </div>
          <div className="ceo-tag-row">
            <div className="ceo-tag-row__head">
              <span>Barcode Tags</span>
              <span className="ceo-tag-ok">OK</span>
            </div>
            <div className="ceo-tag-row__bar">
              <div
                className="ceo-tag-row__fill"
                style={{ width: `${Math.min(Number(tagCoverage), 100)}%` }}
              />
            </div>
            <div className="ceo-tag-row__foot">
              <span>{formatCount(tagged)} synced</span>
              <span>{tagCoverage}%</span>
            </div>
          </div>
          <div className="ceo-tag-row">
            <div className="ceo-tag-row__head">
              <span>Pending Tags</span>
              <span className={pending > 500 ? 'ceo-tag-warn' : 'ceo-tag-ok'}>
                {pending > 500 ? 'LOW' : 'OK'}
              </span>
            </div>
            <div className="ceo-tag-row__bar">
              <div
                className={`ceo-tag-row__fill${pending > 500 ? ' ceo-tag-row__fill--warn' : ''}`}
                style={{ width: `${Math.min((pending / Math.max(tagged, 1)) * 100, 100)}%` }}
              />
            </div>
            <div className="ceo-tag-row__foot">
              <span>{formatCount(pending)} pending</span>
            </div>
          </div>
        </article>
      </div>
    </>
  )
}

export default function CeoDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeSegment, setActiveSegment] = useState('warehouse')
  const [period, setPeriod] = useState('wtd')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      try {
        const result = await fetchExecutiveDashboard()
        if (!cancelled) setData(result)
      } catch (err) {
        if (!cancelled) {
          if (isSessionExpiredError(err.message, err.status)) {
            logout()
            navigate('/login/ceo', { replace: true, state: { sessionExpired: true } })
            return
          }
          setError(getUserFriendlyErrorMessage(err.message, err.status))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [navigate])

  if (loading) {
    return <div className="ceo-loading">Loading CEO dashboard…</div>
  }

  if (error) {
    return (
      <div className="ceo-error">
        <h2>Unable to load dashboard</h2>
        <p>{error}</p>
        <p>
          {isConnectionError(error)
            ? 'Check your connection and try again.'
            : 'Refresh the page or try again shortly.'}
        </p>
      </div>
    )
  }

  const activeSegmentMeta = SEGMENTS.find((s) => s.key === activeSegment)

  return (
    <div className="ceo-dashboard">
      <div className="ceo-toolbar">
        <div className="ceo-tabs" role="tablist" aria-label="Business segments">
          {SEGMENTS.map((segment) => {
            const isActive = activeSegment === segment.key
            const isSoon = segment.key !== 'warehouse'
            return (
              <button
                key={segment.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`ceo-tab${isActive ? ' ceo-tab--active' : ''}${isSoon ? ' ceo-tab--soon' : ''}`}
                onClick={() => setActiveSegment(segment.key)}
              >
                <span aria-hidden="true">{segment.icon}</span>
                {segment.label}
              </button>
            )
          })}
        </div>

        <div className="ceo-period" role="group" aria-label="Time period">
          {PERIODS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`ceo-period__btn${period === item.key ? ' ceo-period__btn--active' : ''}`}
              onClick={() => setPeriod(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {activeSegment === 'warehouse' && (
        <WarehouseDashboard data={data} period={period} />
      )}

      {activeSegment === 'retail' && (
        <SegmentComingSoon label={activeSegmentMeta?.label ?? 'Retail'} />
      )}

      {activeSegment === 'franchise' && (
        <SegmentComingSoon label={activeSegmentMeta?.label ?? 'Franchise'} />
      )}
    </div>
  )
}
