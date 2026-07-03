import { useMemo } from 'react'
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
import './OverallDashboard.css'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const FRANCHISE_CATEGORY_COLORS = ['#a33030', '#f97316', '#eab308', '#64748b', '#94a3b8']

function formatCount(value) {
  return Number(value ?? 0).toLocaleString('en-IN')
}

function formatQty(value) {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric)) return '0'
  if (Number.isInteger(numeric)) return numeric.toLocaleString('en-IN')
  return numeric.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function toDateKey(date) {
  const d = date instanceof Date ? date : new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return String(date).slice(0, 10)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildInwardBarData(apiData) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const byDate = Object.fromEntries(
    (apiData || []).map((row) => [row.date, Number(row.qty ?? 0)]),
  )

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (6 - index))
    const dateKey = toDateKey(date)
    const weekdayIndex = (date.getDay() + 6) % 7
    const dayIndex = date.getDay()
    return {
      day: WEEKDAYS[weekdayIndex],
      date: dateKey,
      qty: byDate[dateKey] ?? 0,
      isWeekend: dayIndex === 0 || dayIndex === 6,
      isFriday: dayIndex === 5,
    }
  })
}

function franchiseAccuracyColor(pct) {
  if (pct >= 95) return '#22c55e'
  if (pct >= 90) return '#84cc16'
  return '#ef4444'
}

function franchiseShrinkageColor(pcs, index) {
  return index === 0 ? '#a33030' : '#f97316'
}

function SectionHeading({ children }) {
  return (
    <div className="overall-section-heading">
      <h2 className="overall-section-title overall-section-title--accent">{children}</h2>
      <span className="overall-section-heading__line" aria-hidden="true" />
    </div>
  )
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  return (
    <div className="chart-tip">
      <p className="chart-tip__title">{item?.day}</p>
      <p className="chart-tip__value">{formatQty(item?.qty)} units</p>
    </div>
  )
}

function PartnerStatusBadge({ status }) {
  const normalized = String(status ?? '').toLowerCase()
  if (normalized === 'healthy' || normalized === 'ok') {
    return <span className="overall-retail-status overall-retail-status--ok">✓ Healthy</span>
  }
  if (normalized === 'critical') {
    return <span className="overall-retail-status overall-retail-status--danger">⚠ Critical</span>
  }
  if (normalized === 'restock' || normalized === 'reorder') {
    return <span className="overall-retail-status overall-retail-status--warn">⚠ Restock</span>
  }
  return <span className="overall-retail-status overall-retail-status--muted">—</span>
}

function HorizontalPartnerBars({ data, dataKey, colorFn, unit, labelKey = 'partner' }) {
  const rows = data.length > 0 ? data : [{ [labelKey]: '—', [dataKey]: 0 }]

  return (
    <div className="overall-retail-hbars">
      {rows.map((row, index) => {
        const value = Number(row[dataKey] ?? 0)
        const max = Math.max(...rows.map((r) => Number(r[dataKey] ?? 0)), 1)
        const width = (value / max) * 100
        const color = typeof colorFn === 'function' && colorFn.length >= 2
          ? colorFn(value, index)
          : colorFn(value)
        return (
          <div key={row[labelKey]} className="overall-retail-hbar">
            <span className="overall-retail-hbar__label">{row[labelKey]}</span>
            <div className="overall-retail-hbar__track">
              <div
                className="overall-retail-hbar__fill"
                style={{ width: `${width}%`, background: color }}
              />
            </div>
            <span className="overall-retail-hbar__value">
              {formatQty(value)}{unit}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function InTransitStatus({ dc }) {
  const status = String(dc.status ?? '').toLowerCase()
  if (status === 'overdue') {
    return <span className="overall-franchise-dc overall-franchise-dc--danger">{dc.statusLabel || 'OVERDUE'}</span>
  }
  if (status === 'done' || status === 'complete') {
    return <span className="overall-franchise-dc overall-franchise-dc--ok">{dc.statusLabel || 'Done'}</span>
  }
  if (dc.hours > 0) {
    return <span className="overall-franchise-dc overall-franchise-dc--warn">{formatCount(dc.hours)} hrs</span>
  }
  return <span className="overall-franchise-dc overall-franchise-dc--muted">0 hrs</span>
}

function HardwareStatusRow({ name, online, total }) {
  const allOnline = online === total && total > 0
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
          <span className="overall-hw-row__badge">{total - online} offline</span>
        )}
      </span>
    </li>
  )
}

export default function FranchiseDashboard({ data }) {
  const franchise = data?.franchise ?? {}
  const summary = franchise.summary ?? {}

  const inwardBarData = buildInwardBarData(franchise.inwardDaily ?? [])
  const accuracyData = franchise.partnerAccuracy ?? []
  const stockRows = franchise.stockOnHand ?? []
  const inTransitDCs = franchise.inTransitDCs ?? []
  const billingRows = franchise.billingPerformance ?? []
  const shrinkageRows = franchise.shrinkageByPartner ?? []
  const hardware = franchise.hardware ?? []
  const partnerSyncRows = franchise.partnerSync ?? []
  const sync = franchise.sync ?? {}

  const categoryData = useMemo(() => {
    const rows = franchise.categorySellThrough ?? []
    if (!rows.length) {
      return [{ name: '—', value: 0, pct: 0, color: '#e2e8f0' }]
    }
    return rows.map((row, index) => ({
      ...row,
      color: FRANCHISE_CATEGORY_COLORS[index % FRANCHISE_CATEGORY_COLORS.length],
    }))
  }, [franchise.categorySellThrough])

  const categoryTotal = categoryData.reduce((sum, row) => sum + Number(row.value ?? 0), 0)

  const allHardwareOnline = hardware.length > 0
    && hardware.every((item) => item.online === item.total)
  const syncHealthy = sync.pendingRecords === 0 && sync.failuresToday === 0

  const dcRows = inTransitDCs.length > 0
    ? inTransitDCs
    : [{ dcId: '—', partnerLabel: '—', units: 0, status: 'in_transit', hours: 0 }]

  return (
    <>
      <SectionHeading>Total RFID Stock — All Franchise Stores</SectionHeading>
      <div className="overall-kpi-grid overall-kpi-grid--5">
        <article className="overall-kpi overall-kpi--blue">
          <p className="overall-kpi__label">Total Franchise Stock</p>
          <p className="overall-kpi__value">{formatQty(summary.totalStock)}</p>
          <p className="overall-kpi__hint">
            Across {formatCount(summary.partnerCount)} franchise partners
          </p>
        </article>
        <article className="overall-kpi overall-kpi--green">
          <p className="overall-kpi__label">Sold (Billed) MTD</p>
          <p className="overall-kpi__value">{formatQty(summary.soldMtd)}</p>
          <p className="overall-kpi__hint overall-kpi__hint--green">
            {summary.soldMtdTrendPct != null
              ? `${summary.soldMtdTrendPct >= 0 ? '+' : ''}${summary.soldMtdTrendPct}% vs last month`
              : '0% vs last month'}
          </p>
        </article>
        <article className="overall-kpi overall-kpi--red">
          <p className="overall-kpi__label">Shrinkage MTD</p>
          <p className="overall-kpi__value">{formatCount(summary.shrinkageMtd)} pcs</p>
          <p className="overall-kpi__hint overall-kpi__hint--danger">
            {summary.shrinkageRiskPct > 0
              ? `${formatQty(summary.shrinkageRiskPct)}% — high risk`
              : '0% — high risk'}
          </p>
        </article>
        <article className="overall-kpi overall-kpi--orange">
          <p className="overall-kpi__label">Pending Verification</p>
          <p className="overall-kpi__value">{formatCount(summary.pendingVerification)}</p>
          <p className="overall-kpi__hint overall-kpi__hint--yellow">
            {summary.pendingVerificationLabel || '0 DC awaiting scan'}
          </p>
        </article>
        <article className="overall-kpi overall-kpi--grey">
          <p className="overall-kpi__label">Avg Stock Accuracy</p>
          <p className="overall-kpi__value">{formatQty(summary.avgStockAccuracy)}%</p>
          <p className={`overall-kpi__hint ${summary.avgStockAccuracy >= summary.accuracyThreshold ? 'overall-kpi__hint--green' : 'overall-kpi__hint--danger'}`}>
            {summary.avgStockAccuracy >= summary.accuracyThreshold
              ? `Above ${formatQty(summary.accuracyThreshold)}% threshold`
              : `Below ${formatQty(summary.accuracyThreshold)}% threshold`}
          </p>
        </article>
      </div>

      <SectionHeading>Partner-Wise Stock &amp; Movement</SectionHeading>
      <div className="overall-panels">
        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Stock Accuracy by Franchise Partner</h3>
          </div>
          <HorizontalPartnerBars
            data={accuracyData}
            dataKey="accuracyPct"
            colorFn={franchiseAccuracyColor}
            unit="%"
          />
          {franchise.accuracyAlert ? (
            <p className="overall-retail-alert overall-retail-alert--danger">{franchise.accuracyAlert}</p>
          ) : (
            <p className="overall-retail-alert overall-retail-alert--muted">
              No accuracy alerts — all partners within target.
            </p>
          )}
        </article>

        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Stock on Hand by Franchise Partner</h3>
          </div>
          <div className="overall-table-wrap">
            <table className="overall-table">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Stock (Units)</th>
                  <th>Days Cover</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(stockRows.length > 0 ? stockRows : [{
                  partner: '—', stock: 0, daysCover: 0, status: '—',
                }]).map((row) => (
                  <tr key={row.partner}>
                    <td>{row.partner}</td>
                    <td>{formatQty(row.stock)}</td>
                    <td>{formatQty(row.daysCover)}</td>
                    <td><PartnerStatusBadge status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {franchise.stockCoverAlert ? (
            <p className="overall-retail-alert overall-retail-alert--warn">{franchise.stockCoverAlert}</p>
          ) : null}
        </article>
      </div>

      <SectionHeading>Movement — Inward &amp; Verification (Franchise)</SectionHeading>
      <div className="overall-panels">
        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Daily Units Inward at Franchise Partners (last 7 days)</h3>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={inwardBarData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(163, 48, 48, 0.06)' }} />
              <Bar dataKey="qty" radius={[4, 4, 0, 0]} maxBarSize={42}>
                {inwardBarData.map((entry) => (
                  <Cell
                    key={entry.date}
                    fill={entry.isWeekend ? '#cbd5e1' : entry.isFriday ? '#a33030' : '#f97316'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>In-Transit — Franchise DCs</h3>
          </div>
          <ul className="overall-transit-list overall-transit-list--franchise">
            {dcRows.map((dc) => (
              <li key={`${dc.dcId}-${dc.partnerLabel}`}>
                <span>
                  {dc.dcId} · {dc.partnerLabel} · {formatCount(dc.units)} units
                </span>
                <InTransitStatus dc={dc} />
              </li>
            ))}
          </ul>
          {franchise.inTransitAlert ? (
            <p className="overall-retail-alert overall-retail-alert--danger">{franchise.inTransitAlert}</p>
          ) : (
            <p className="overall-retail-alert overall-retail-alert--muted">
              No in-transit alerts — all franchise DCs on schedule.
            </p>
          )}
        </article>
      </div>

      <SectionHeading>Billing &amp; Shrinkage (Franchise)</SectionHeading>
      <div className="overall-retail-billing-grid">
        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Billing Performance (MTD)</h3>
          </div>
          <div className="overall-table-wrap">
            <table className="overall-table">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Bills Today</th>
                  <th>Avg Time</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {(billingRows.length > 0 ? billingRows : [{
                  partner: '—', billsToday: 0, avgTimeSec: 0, errorPct: 0,
                }]).map((row) => (
                  <tr key={row.partner}>
                    <td>{row.partner}</td>
                    <td>{formatCount(row.billsToday)}</td>
                    <td>
                      <span className="overall-franchise-pill overall-franchise-pill--ok">
                        {formatCount(row.avgTimeSec)}s
                      </span>
                    </td>
                    <td>
                      <span className={`overall-franchise-pill ${row.errorPct > 1 ? 'overall-franchise-pill--danger' : 'overall-franchise-pill--ok'}`}>
                        {formatQty(row.errorPct)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {franchise.billingAlert ? (
            <p className="overall-retail-alert overall-retail-alert--warn">{franchise.billingAlert}</p>
          ) : null}
        </article>

        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Shrinkage by Partner (MTD)</h3>
          </div>
          <HorizontalPartnerBars
            data={shrinkageRows}
            dataKey="shrinkagePcs"
            colorFn={franchiseShrinkageColor}
            unit=" pcs"
          />
          <div className="overall-retail-mini-stats">
            <div className="overall-retail-mini-stat">
              <strong>{formatCount(franchise.shrinkageMtd)} pcs</strong>
              <span>Total shrinkage MTD</span>
            </div>
            <div className="overall-retail-mini-stat overall-retail-mini-stat--warn">
              <strong>{formatQty(franchise.shrinkagePct)}%</strong>
              <span>Shrinkage %</span>
            </div>
          </div>
          {franchise.shrinkageComment ? (
            <p className="overall-retail-alert overall-retail-alert--danger">{franchise.shrinkageComment}</p>
          ) : (
            <p className="overall-retail-alert overall-retail-alert--muted">
              No shrinkage review required at this time.
            </p>
          )}
        </article>

        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Category Sell-through (Franchise MTD)</h3>
          </div>
          <div className="overall-donut-wrap overall-donut-wrap--compact">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
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
                  {categoryData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="overall-donut-center">
              <strong>{formatQty(categoryTotal)}</strong>
              <span>units sold</span>
            </div>
          </div>
          <div className="overall-donut-legend overall-donut-legend--stacked">
            {categoryData.map((entry) => (
              <span key={entry.name}>
                <i style={{ background: entry.color }} />
                {entry.name} ({entry.pct || 0}%)
              </span>
            ))}
          </div>
        </article>
      </div>

      <SectionHeading>Hardware &amp; Sync — Franchise Partners</SectionHeading>
      <div className="overall-hw-grid">
        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Hardware Status (Franchise)</h3>
          </div>
          <ul className="overall-hw-list">
            {(hardware.length > 0 ? hardware : [{ name: '—', online: 0, total: 0 }]).map((item) => (
              <HardwareStatusRow key={item.name} {...item} />
            ))}
          </ul>
        </article>

        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Offline Sync — Franchise Partners</h3>
          </div>
          <div className="overall-sync-metrics">
            <div className="overall-sync-metric">
              <strong className="overall-sync-metric__value overall-sync-metric__value--ok">
                {formatCount(sync.pendingRecords)}
              </strong>
              <span className="overall-sync-metric__label">Pending sync records</span>
            </div>
            <div className="overall-sync-metric">
              <strong className="overall-sync-metric__value overall-sync-metric__value--ok">
                {formatCount(sync.failuresToday)}
              </strong>
              <span className="overall-sync-metric__label">Sync failures today</span>
            </div>
            <div className="overall-sync-metric">
              <strong className="overall-sync-metric__value">
                {formatCount(sync.avgLastSyncMinutes)} min
              </strong>
              <span className="overall-sync-metric__label">Avg last sync</span>
            </div>
          </div>

          <div className="overall-table-wrap overall-table-wrap--spaced">
            <table className="overall-table">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Last Sync</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(partnerSyncRows.length > 0 ? partnerSyncRows : [{
                  partner: '—', lastSync: '0 min ago', syncStatus: 'live',
                }]).map((row) => (
                  <tr key={row.partner}>
                    <td>{row.partner}</td>
                    <td>{row.lastSync}</td>
                    <td>
                      <span className={`overall-franchise-live ${row.syncStatus === 'live' || row.syncStatus === 'ok' ? 'overall-franchise-live--ok' : 'overall-franchise-live--warn'}`}>
                        {row.syncStatus === 'live' || row.syncStatus === 'ok' ? '● Live' : '⚠ Delayed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {allHardwareOnline && syncHealthy ? (
            <p className="overall-sync-banner overall-sync-banner--ok">
              <span aria-hidden="true">✓</span>
              All franchise stations are online and synced to cloud. No offline backlog.
            </p>
          ) : (
            <p className="overall-sync-banner overall-sync-banner--warn">
              <span aria-hidden="true">!</span>
              Some franchise stations are offline or have pending sync records.
            </p>
          )}
        </article>
      </div>
    </>
  )
}
