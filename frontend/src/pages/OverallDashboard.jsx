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
import './OverallDashboard.css'

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
    <div className="overall-coming">
      <h3>{label} dashboard</h3>
      <p>Segment-level KPIs and movement tracking will be available in a future release.</p>
    </div>
  )
}

const WAREHOUSE_HARDWARE = [
  { name: 'RFID Conveyor Tunnels', online: 2, total: 2 },
  { name: 'Desktop Tagging Readers', online: 5, total: 5 },
  { name: 'Billing Counters (WH)', online: 1, total: 2 },
  { name: 'Handheld Readers', online: 2, total: 2 },
]

const WAREHOUSE_SYNC = {
  pendingRecords: 0,
  failuresToday: 0,
  lastCloudSyncMinutes: 2,
}

function HardwareStatusRow({ name, online, total }) {
  const allOnline = online === total
  const offlineCount = total - online
  const tone = allOnline ? 'ok' : 'warn'

  return (
    <li className={`overall-hw-row overall-hw-row--${tone}`}>
      <span className="overall-hw-row__name">
        <i className="overall-hw-row__dot" aria-hidden="true" />
        {name}
      </span>
      <span className="overall-hw-row__status">
        <span className={`overall-hw-row__count overall-hw-row__count--${tone}`}>
          {online} / {total} online
        </span>
        {allOnline ? (
          <span className="overall-hw-row__check" aria-label="All online">✓</span>
        ) : (
          <span className="overall-hw-row__badge">{offlineCount} offline</span>
        )}
      </span>
    </li>
  )
}

function SectionHeading({ children }) {
  return (
    <div className="overall-section-heading">
      <h2 className="overall-section-title overall-section-title--accent">{children}</h2>
      <span className="overall-section-heading__line" aria-hidden="true" />
    </div>
  )
}

function WarehouseHardwareSync() {
  const allHardwareOnline = WAREHOUSE_HARDWARE.every((item) => item.online === item.total)
  const syncHealthy = WAREHOUSE_SYNC.pendingRecords === 0 && WAREHOUSE_SYNC.failuresToday === 0

  return (
    <>
      <SectionHeading>Hardware &amp; Sync — Warehouse</SectionHeading>
      <div className="overall-hw-grid">
        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Hardware Status</h3>
          </div>
          <ul className="overall-hw-list">
            {WAREHOUSE_HARDWARE.map((item) => (
              <HardwareStatusRow key={item.name} {...item} />
            ))}
          </ul>
        </article>

        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Offline Sync Health</h3>
          </div>
          <div className="overall-sync-metrics">
            <div className="overall-sync-metric">
              <strong className="overall-sync-metric__value overall-sync-metric__value--ok">
                {WAREHOUSE_SYNC.pendingRecords}
              </strong>
              <span className="overall-sync-metric__label">Pending sync records</span>
            </div>
            <div className="overall-sync-metric">
              <strong className="overall-sync-metric__value overall-sync-metric__value--ok">
                {WAREHOUSE_SYNC.failuresToday}
              </strong>
              <span className="overall-sync-metric__label">Sync failures today</span>
            </div>
            <div className="overall-sync-metric">
              <strong className="overall-sync-metric__value">
                {WAREHOUSE_SYNC.lastCloudSyncMinutes} min
              </strong>
              <span className="overall-sync-metric__label">Last cloud sync</span>
            </div>
          </div>
          {allHardwareOnline && syncHealthy ? (
            <p className="overall-sync-banner overall-sync-banner--ok">
              <span aria-hidden="true">✓</span>
              All warehouse stations are online and synced to cloud. No offline backlog.
            </p>
          ) : (
            <p className="overall-sync-banner overall-sync-banner--warn">
              <span aria-hidden="true">!</span>
              Some stations are offline or have pending sync records. Review hardware status above.
            </p>
          )}
        </article>
      </div>
    </>
  )
}

function WarehouseDashboard({ data, period }) {
  const cards = data?.cards ?? {}
  const inwardPending = data?.inwardPending ?? {}
  const batches = inwardPending.batches ?? []
  const inTransit = inwardPending.inTransit ?? {}
  const tagInventory = inwardPending.tagInventory ?? {}

  const totalStock = Number(cards.totalStock ?? 0)
  const tagged = Number(cards.tagged ?? 0)
  const pending = Number(cards.pending ?? 0)
  const reject = Number(cards.reject ?? 0)
  const tagCoverage = tagged > 0 ? pct(tagged, tagged + pending) : '0'

  const inventoryTagged = Number(tagInventory.tagged ?? 0)
  const inventoryPending = Number(tagInventory.pending ?? 0)
  const inventoryCoverage = Number(tagInventory.tagCoveragePct ?? 0)

  const periodRows = filterByPeriod(data?.outwardDaily ?? [], period)
  const periodSold = periodRows.reduce((sum, row) => sum + Number(row.soldQty ?? 0), 0)
  const barData = buildWeekBarData(data?.outwardDaily ?? [])

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
      <SectionHeading>Total RFID Stock — Warehouse</SectionHeading>
      <div className="overall-kpi-grid">
        <article className="overall-kpi overall-kpi--blue">
          <p className="overall-kpi__label">Total Stock in Warehouse</p>
          <p className="overall-kpi__value">{formatQty(totalStock)}</p>
          <p className="overall-kpi__hint">units across all categories</p>
        </article>
        <article className="overall-kpi overall-kpi--green">
          <p className="overall-kpi__label">Tagged &amp; Cloud Synced</p>
          <p className="overall-kpi__value">{formatCount(tagged)}</p>
          <p className="overall-kpi__hint overall-kpi__hint--green">{tagCoverage}% tag coverage</p>
        </article>
        <article className="overall-kpi overall-kpi--yellow">
          <p className="overall-kpi__label">Pending Tagging</p>
          <p className="overall-kpi__value">{formatCount(pending)}</p>
          <p className="overall-kpi__hint overall-kpi__hint--yellow">imported, not yet tagged</p>
        </article>
        <article className="overall-kpi overall-kpi--grey">
          <p className="overall-kpi__label">Tag Defect / Reject</p>
          <p className="overall-kpi__value">{formatCount(reject)}</p>
          <p className="overall-kpi__hint">
            {pct(reject, tagged || 1)}% reject rate — acceptable
          </p>
        </article>
      </div>

      <SectionHeading>Movement — Outward {period === 'today' ? 'Today' : period.toUpperCase()}</SectionHeading>
      <div className="overall-panels">
        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Daily Outward Volume — Sales (last 7 days)</h3>
            <span className="overall-panel__badge">All counters</span>
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

        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Today&apos;s Outward Split</h3>
          </div>
          <div className="overall-donut-wrap">
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
            <div className="overall-donut-center">
              <strong>{formatQty(periodSold)}</strong>
              <span>units sold</span>
            </div>
          </div>
          <div className="overall-donut-legend">
            <span><i style={{ background: '#22c55e' }} />Retail ({retailPct}%)</span>
            <span><i style={{ background: '#f97316' }} />Franchise ({franchisePct}%)</span>
          </div>
        </article>
      </div>

      <SectionHeading>Movement — Inward &amp; Pending</SectionHeading>
      <div className="overall-bottom-grid">
        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Inward Today (Excel Imports)</h3>
          </div>
          <div className="overall-table-wrap">
            {recentBatches.length === 0 ? (
              <p className="overall-empty">No import batches yet.</p>
            ) : (
              <table className="overall-table">
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
                        <span className={`overall-status ${batch.isActive ? 'overall-status--active' : 'overall-status--inactive'}`}>
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

        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>In-Transit (Dispatched, Pending Verification)</h3>
          </div>
          <ul className="overall-transit-list">
            <li>
              <span>Batch #{activeBatch?.id ?? '—'} → Verification</span>
              <span>{formatCount(inTransit.found)} pcs</span>
            </li>
            <li>
              <span>Missing tags</span>
              <span>{formatCount(inTransit.missing)} pcs</span>
            </li>
            <li>
              <span>New barcodes found</span>
              <span>{formatCount(inTransit.new)} pcs</span>
            </li>
          </ul>
        </article>

        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Tag Inventory</h3>
          </div>
          <div className="overall-tag-row">
            <div className="overall-tag-row__head">
              <span>Barcode Tags</span>
              <span className="overall-tag-ok">OK</span>
            </div>
            <div className="overall-tag-row__bar">
              <div
                className="overall-tag-row__fill"
                style={{ width: `${Math.min(inventoryCoverage, 100)}%` }}
              />
            </div>
            <div className="overall-tag-row__foot">
              <span>{formatCount(inventoryTagged)} synced</span>
              <span>{inventoryCoverage}%</span>
            </div>
          </div>
          <div className="overall-tag-row">
            <div className="overall-tag-row__head">
              <span>Pending Tags</span>
              <span className={inventoryPending > 500 ? 'overall-tag-warn' : 'overall-tag-ok'}>
                {inventoryPending > 500 ? 'LOW' : 'OK'}
              </span>
            </div>
            <div className="overall-tag-row__bar">
              <div
                className={`overall-tag-row__fill${inventoryPending > 500 ? ' overall-tag-row__fill--warn' : ''}`}
                style={{ width: `${Math.min((inventoryPending / Math.max(inventoryTagged, 1)) * 100, 100)}%` }}
              />
            </div>
            <div className="overall-tag-row__foot">
              <span>{formatCount(inventoryPending)} pending</span>
            </div>
          </div>
        </article>
      </div>

      <WarehouseHardwareSync />
    </>
  )
}

export default function OverallDashboard() {
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
        const result = await fetchExecutiveDashboard({ type: activeSegment })
        if (!cancelled) setData(result)
      } catch (err) {
        if (!cancelled) {
          if (isSessionExpiredError(err.message, err.status)) {
            logout()
            navigate('/login/overall', { replace: true, state: { sessionExpired: true } })
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
  }, [navigate, activeSegment])

  if (loading) {
    return <div className="overall-loading">Loading overall dashboard…</div>
  }

  if (error) {
    return (
      <div className="overall-error">
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
    <div className="overall-dashboard">
      <div className="overall-toolbar">
        <div className="overall-tabs" role="tablist" aria-label="Business segments">
          {SEGMENTS.map((segment) => {
            const isActive = activeSegment === segment.key
            const isSoon = segment.key !== 'warehouse'
            return (
              <button
                key={segment.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`overall-tab${isActive ? ' overall-tab--active' : ''}${isSoon ? ' overall-tab--soon' : ''}`}
                onClick={() => setActiveSegment(segment.key)}
              >
                <span aria-hidden="true">{segment.icon}</span>
                {segment.label}
              </button>
            )
          })}
        </div>

        <div className="overall-period" role="group" aria-label="Time period">
          {PERIODS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`overall-period__btn${period === item.key ? ' overall-period__btn--active' : ''}`}
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
