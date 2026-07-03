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

const CATEGORY_COLORS = ['#a33030', '#22c55e', '#3b82f6', '#f97316', '#8b5cf6', '#94a3b8']

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

function accuracyBarColor(pct) {
  if (pct >= 97) return '#22c55e'
  if (pct >= 93) return '#84cc16'
  return '#f97316'
}

function leadTimeBarColor(hours) {
  if (hours <= 10) return '#22c55e'
  if (hours <= 14) return '#84cc16'
  return '#f97316'
}

function SectionHeading({ children }) {
  return (
    <div className="overall-section-heading">
      <h2 className="overall-section-title overall-section-title--accent">{children}</h2>
      <span className="overall-section-heading__line" aria-hidden="true" />
    </div>
  )
}

function ChartTooltip({ active, payload, labelKey = 'qty', unit = 'units' }) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  return (
    <div className="chart-tip">
      <p className="chart-tip__title">{item?.store ?? item?.day}</p>
      <p className="chart-tip__value">{formatQty(item?.[labelKey])} {unit}</p>
    </div>
  )
}

function StoreStatusBadge({ status }) {
  const normalized = String(status ?? '').toLowerCase()
  if (normalized === 'healthy' || normalized === 'ok') {
    return <span className="overall-retail-status overall-retail-status--ok">✓ Healthy</span>
  }
  if (normalized === 'restock' || normalized === 'reorder') {
    return <span className="overall-retail-status overall-retail-status--warn">⚠ Restock</span>
  }
  return <span className="overall-retail-status overall-retail-status--muted">—</span>
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

function HorizontalMetricBars({ data, dataKey, colorFn, unit }) {
  const rows = data.length > 0 ? data : [{ store: '—', [dataKey]: 0 }]

  return (
    <div className="overall-retail-hbars">
      {rows.map((row) => {
        const value = Number(row[dataKey] ?? 0)
        const max = Math.max(...rows.map((r) => Number(r[dataKey] ?? 0)), 1)
        const width = (value / max) * 100
        return (
          <div key={row.store} className="overall-retail-hbar">
            <span className="overall-retail-hbar__label">{row.store}</span>
            <div className="overall-retail-hbar__track">
              <div
                className="overall-retail-hbar__fill"
                style={{ width: `${width}%`, background: colorFn(value) }}
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

export default function RetailDashboard({ data }) {
  const retail = data?.retail ?? {}
  const summary = retail.summary ?? {}

  const inwardBarData = buildInwardBarData(retail.inwardDaily ?? [])
  const accuracyData = retail.storeAccuracy ?? []
  const stockRows = retail.stockOnHand ?? []
  const leadTimeData = retail.inwardLeadTime ?? []
  const billingRows = retail.billingPerformance ?? []
  const shrinkageRows = retail.shrinkageByStore ?? []
  const hardware = retail.hardware ?? []
  const storeSyncRows = retail.storeSync ?? []
  const sync = retail.sync ?? {}

  const categoryData = useMemo(() => {
    const rows = retail.categorySellThrough ?? []
    if (!rows.length) {
      return [{ name: '—', value: 0, pct: 0, color: '#e2e8f0' }]
    }
    return rows.map((row, index) => ({
      ...row,
      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    }))
  }, [retail.categorySellThrough])

  const categoryTotal = categoryData.reduce((sum, row) => sum + Number(row.value ?? 0), 0)

  const allHardwareOnline = hardware.length > 0
    && hardware.every((item) => item.online === item.total)
  const syncHealthy = sync.pendingRecords === 0 && sync.failuresToday === 0

  return (
    <>
      <SectionHeading>Total RFID Stock — All Retail Stores</SectionHeading>
      <div className="overall-kpi-grid overall-kpi-grid--5">
        <article className="overall-kpi overall-kpi--blue">
          <p className="overall-kpi__label">Total Retail Stock (All Stores)</p>
          <p className="overall-kpi__value">{formatQty(summary.totalStock)}</p>
          <p className="overall-kpi__hint">
            Across {formatCount(summary.storeCount)} total stores
          </p>
        </article>
        <article className="overall-kpi overall-kpi--green">
          <p className="overall-kpi__label">Sold (Bills) MTD</p>
          <p className="overall-kpi__value">{formatQty(summary.soldMtd)}</p>
          <p className="overall-kpi__hint overall-kpi__hint--green">
            {summary.soldMtdTrendPct != null
              ? `${summary.soldMtdTrendPct >= 0 ? '+' : ''}${summary.soldMtdTrendPct}% vs last month`
              : '0% vs last month'}
          </p>
        </article>
        <article className="overall-kpi overall-kpi--yellow">
          <p className="overall-kpi__label">Shrinkage MTD</p>
          <p className="overall-kpi__value">{formatCount(summary.shrinkageMtd)} pcs</p>
          <p className="overall-kpi__hint overall-kpi__hint--green">
            {summary.shrinkageTrendPct != null
              ? `${summary.shrinkageTrendPct}% — improving`
              : '0% — improving'}
          </p>
        </article>
        <article className="overall-kpi overall-kpi--grey">
          <p className="overall-kpi__label">Stores Needing Restock</p>
          <p className="overall-kpi__value">{formatCount(summary.storesNeedingRestock)}</p>
          <p className="overall-kpi__hint overall-kpi__hint--yellow">
            {summary.restockStoreLabel || '—'}
          </p>
        </article>
        <article className="overall-kpi overall-kpi--blue">
          <p className="overall-kpi__label">Avg. Stock Accuracy</p>
          <p className="overall-kpi__value">{formatQty(summary.avgStockAccuracy)}%</p>
          <p className="overall-kpi__hint overall-kpi__hint--green">
            target &gt; {formatQty(summary.accuracyTarget)}%
          </p>
        </article>
      </div>

      <SectionHeading>Storewide Stock &amp; Movement</SectionHeading>
      <div className="overall-panels">
        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Stock Accuracy by Store</h3>
          </div>
          <HorizontalMetricBars
            data={accuracyData}
            dataKey="accuracyPct"
            colorFn={accuracyBarColor}
            unit="%"
          />
          {retail.accuracyAlert ? (
            <p className="overall-retail-alert">{retail.accuracyAlert}</p>
          ) : (
            <p className="overall-retail-alert overall-retail-alert--muted">
              No accuracy alerts — all stores within target.
            </p>
          )}
        </article>

        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Stock on Hand by Store</h3>
          </div>
          <div className="overall-table-wrap">
            <table className="overall-table">
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Stock (Units)</th>
                  <th>Days Cover</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(stockRows.length > 0 ? stockRows : [{ store: '—', stock: 0, daysCover: 0, status: '—' }]).map((row) => (
                  <tr key={row.store}>
                    <td>{row.store}</td>
                    <td>{formatQty(row.stock)}</td>
                    <td>{formatQty(row.daysCover)}</td>
                    <td><StoreStatusBadge status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <SectionHeading>Movement — Inward &amp; Outward (Retail)</SectionHeading>
      <div className="overall-panels">
        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Daily Units Inward (last 7 days)</h3>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={inwardBarData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
              <Tooltip content={<ChartTooltip labelKey="qty" unit="units" />} cursor={{ fill: 'rgba(163, 48, 48, 0.06)' }} />
              <Bar dataKey="qty" radius={[4, 4, 0, 0]} maxBarSize={42}>
                {inwardBarData.map((entry) => (
                  <Cell
                    key={entry.date}
                    fill={entry.isWeekend ? '#cbd5e1' : entry.isFriday ? '#22c55e' : '#a33030'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Inward Lead Time (Warehouse → Store)</h3>
          </div>
          <HorizontalMetricBars
            data={leadTimeData}
            dataKey="leadTimeHours"
            colorFn={leadTimeBarColor}
            unit=" hrs"
          />
        </article>
      </div>

      <SectionHeading>Billing &amp; Shrinkage (Retail)</SectionHeading>
      <div className="overall-retail-billing-grid">
        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Billing Performance</h3>
          </div>
          <div className="overall-table-wrap">
            <table className="overall-table">
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Bills Today</th>
                  <th>Avg Time</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {(billingRows.length > 0 ? billingRows : [{
                  store: '—', billsToday: 0, avgTimeSec: 0, errorPct: 0,
                }]).map((row) => (
                  <tr key={row.store}>
                    <td>{row.store}</td>
                    <td>{formatCount(row.billsToday)}</td>
                    <td>{formatCount(row.avgTimeSec)}s</td>
                    <td className={row.errorPct > 3 ? 'overall-retail-text-warn' : ''}>
                      {formatQty(row.errorPct)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Shrinkage by Store</h3>
          </div>
          <HorizontalMetricBars
            data={shrinkageRows}
            dataKey="shrinkagePcs"
            colorFn={() => '#a33030'}
            unit=" pcs"
          />
          <div className="overall-retail-mini-stats">
            <div className="overall-retail-mini-stat">
              <strong>{formatCount(retail.shrinkageMtd)} pcs</strong>
              <span>Total shrinkage MTD</span>
            </div>
            <div className="overall-retail-mini-stat overall-retail-mini-stat--warn">
              <strong>{formatCount(retail.easAlarmsToday)}</strong>
              <span>Exit gate alarms today</span>
            </div>
          </div>
        </article>

        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Category Sell-through</h3>
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

      <SectionHeading>Hardware &amp; Sync — Retail Stores</SectionHeading>
      <div className="overall-hw-grid">
        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Hardware Status</h3>
          </div>
          <ul className="overall-hw-list">
            {(hardware.length > 0 ? hardware : [{ name: '—', online: 0, total: 0 }]).map((item) => (
              <HardwareStatusRow key={item.name} {...item} />
            ))}
          </ul>
        </article>

        <article className="overall-panel">
          <div className="overall-panel__head">
            <h3>Offline Sync</h3>
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
                  <th>Store</th>
                  <th>Last Sync</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(storeSyncRows.length > 0 ? storeSyncRows : [{
                  store: '—', lastSync: '0 min ago', syncStatus: 'ok',
                }]).map((row) => (
                  <tr key={row.store}>
                    <td>{row.store}</td>
                    <td>{row.lastSync}</td>
                    <td>
                      <span className={`overall-retail-sync ${row.syncStatus === 'ok' ? 'overall-retail-sync--ok' : 'overall-retail-sync--warn'}`}>
                        {row.syncStatus === 'ok' ? '✓ OK' : '⚠ Delayed'}
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
              All retail stations are online and synced to cloud. No offline backlog.
            </p>
          ) : (
            <p className="overall-sync-banner overall-sync-banner--warn">
              <span aria-hidden="true">!</span>
              Some retail stations are offline or have pending sync records.
            </p>
          )}
        </article>
      </div>
    </>
  )
}
