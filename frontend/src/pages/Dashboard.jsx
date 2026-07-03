import { useEffect, useMemo, useState } from 'react'
import { useBranchScope } from '../hooks/useBranchScope.js'
import { getUser, hasPermission, isAuthenticated, isLogoutInProgress } from '../services/auth.js'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  EMPTY_COUNTER_ACCURACY,
  EMPTY_STOCKTAKE,
  EMPTY_VERIFICATION,
  fetchBranchComparison,
  fetchDailyImports,
  fetchDashboard,
  fetchDayWiseSales,
  fetchSmartAlerts,
  fetchStockMovement,
  fetchTopSoldProducts,
} from '../services/dashboard.js'
import './Module.css'
import './Dashboard.css'

function DashboardTitleRow({ className = '', children }) {
  return (
    <div className={`dashboard-title-row${className ? ` ${className}` : ''}`}>
      <span className="dashboard-title-accent" aria-hidden="true" />
      {children}
    </div>
  )
}

const CHART_COLORS = ['#b8860b', '#d4af37', '#c9a227', '#a67c00', '#e8c547', '#9a7209', '#f0c75e', '#8b6914']

const CATEGORY_CHART_COLORS = [
  '#b8860b',
  '#3b8ad9',
  '#21a371',
  '#d15b31',
  '#8378d9',
  '#d15b8a',
  '#6ba331',
  '#5c8ea8',
]

const CATEGORY_OTHERS_COLOR = '#c49a6c'

const BRANCH_CHART_COLORS = ['#b8860b', '#3b8ad9', '#8378d9', '#21a371', '#d15b31', '#6ba331']

const DAY_SALES_PERIODS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

const DAY_SALES_COUNTERS = [
  { value: 'all', label: 'All counters' },
  { value: 'showroom', label: 'Showroom' },
  { value: 'safe', label: 'Safe' },
]

const DAILY_IMPORT_COUNTERS = [
  { value: 'ALL', label: 'All counters' },
  { value: 'SHOWROOM STOCK', label: 'Showroom' },
  { value: 'SAFE STOCK', label: 'Safe' },
  { value: 'Unassigned', label: 'Unassigned' },
]

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const DAY_SALES_BAR_COLORS = {
  weekday: '#b8860b',
  saturday: '#d97706',
  today: '#2d9f5f',
}

function toDateKey(date) {
  const d = date instanceof Date ? date : new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return String(date).slice(0, 10)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDayType(dateKey, todayKey) {
  if (dateKey === todayKey) return 'today'
  const date = new Date(`${dateKey}T00:00:00`)
  if (date.getDay() === 6) return 'saturday'
  return 'weekday'
}

function buildWeekChartRows(apiData) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayKey = toDateKey(today)
  const byDate = Object.fromEntries((apiData || []).map((row) => [row.date, row.soldPieces]))

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (6 - index))
    const dateKey = toDateKey(date)
    const dayType = getDayType(dateKey, todayKey)
    const isToday = dateKey === todayKey
    const weekday = WEEKDAY_HEADERS[date.getDay()]
    const dayNum = date.getDate()
    const month = MONTH_NAMES_SHORT[date.getMonth()]

    return {
      date: dateKey,
      day: isToday ? 'Today' : `${weekday} ${dayNum} ${month}`,
      dayShort: isToday ? 'Today' : weekday,
      dayMedium: isToday ? 'Today' : `${dayNum} ${month}`,
      soldPieces: byDate[dateKey] ?? 0,
      dayType,
      isToday,
    }
  })
}

function getHeatLevel(soldPieces, max) {
  if (!soldPieces) return 0
  if (!max) return 1
  const ratio = soldPieces / max
  if (ratio >= 0.8) return 5
  if (ratio >= 0.6) return 4
  if (ratio >= 0.4) return 3
  if (ratio >= 0.2) return 2
  return 1
}

function buildMonthHeatmapRows(apiData) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayKey = toDateKey(today)
  const byDate = Object.fromEntries((apiData || []).map((row) => [row.date, row.soldPieces]))

  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (29 - index))
    const dateKey = toDateKey(date)
    const soldPieces = byDate[dateKey] ?? 0

    return {
      date: dateKey,
      dayNum: date.getDate(),
      weekday: date.getDay(),
      soldPieces,
      isToday: dateKey === todayKey,
      empty: false,
    }
  })

  const maxSold = Math.max(...days.map((row) => row.soldPieces), 0)
  const enrichedDays = days.map((row) => ({
    ...row,
    heatLevel: getHeatLevel(row.soldPieces, maxSold),
  }))

  const leading = Array.from({ length: enrichedDays[0].weekday }, () => ({ empty: true }))
  const cells = [...leading, ...enrichedDays]

  while (cells.length % 7 !== 0) {
    cells.push({ empty: true })
  }

  return { cells, maxSold }
}

function formatCount(value) {
  return Number(value || 0).toLocaleString('en-IN')
}

function formatHeatmapCount(value) {
  const num = Number(value || 0)
  if (!num) return '0'
  if (num >= 10000000) {
    const crores = num / 10000000
    return `${crores % 1 === 0 ? crores.toFixed(0) : crores.toFixed(1)}Cr`
  }
  if (num >= 100000) {
    const lakhs = num / 100000
    return `${lakhs % 1 === 0 ? lakhs.toFixed(0) : lakhs.toFixed(1)}L`
  }
  if (num >= 1000) {
    const thousands = num / 1000
    return `${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`
  }
  return String(num)
}

function truncate(text, max = 18) {
  const str = String(text || '')
  return str.length > max ? `${str.slice(0, max)}…` : str
}

function shortBranchLabel(name) {
  const str = String(name || '').trim()
  if (!str) return '—'
  if (str.length <= 8) return str
  const first = str.split(/[\s(–-]+/)[0]
  return first.length <= 8 ? first : `${first.slice(0, 7)}…`
}

function buildCategoryChartRows(data, totalPieces, { maxCategories = 7 } = {}) {
  const sorted = [...(data || [])]
    .map((row) => ({
      name: String(row.name || 'Unknown'),
      count: Number(row.pieceCount ?? 0),
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)

  const total = Number(totalPieces) || sorted.reduce((sum, row) => sum + row.count, 0)

  let rows = sorted
  if (sorted.length > maxCategories + 1) {
    const top = sorted.slice(0, maxCategories)
    const othersCount = sorted.slice(maxCategories).reduce((sum, row) => sum + row.count, 0)
    rows = othersCount > 0 ? [...top, { name: 'Others', count: othersCount }] : top
  }

  return {
    total,
    rows: rows.map((row, index) => ({
      ...row,
      color: row.name === 'Others'
        ? CATEGORY_OTHERS_COLOR
        : CATEGORY_CHART_COLORS[index % CATEGORY_CHART_COLORS.length],
      percent: total ? Math.round((row.count / total) * 100) : 0,
    })),
  }
}

function formatStocktakeDate(dateStr) {
  if (!dateStr) return '—'
  const date = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(dateStr)
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatAccuracyPercent(value) {
  const num = Number(value ?? 0)
  if (!num) return '0'
  const rounded = Math.round(num * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '')
}

function getStocktakeAccuracyTone(percent) {
  const value = Number(percent ?? 0)
  if (value >= 99) return 'green'
  if (value >= 98.5) return 'gold'
  if (value >= 98) return 'orange'
  return 'red'
}

function getLatestStocktakeSession(stocktake) {
  const sessions = stocktake?.history?.sessions ?? []
  if (!sessions.length) return null
  return sessions[sessions.length - 1]
}

function LastStocktakeFindings({ stocktake }) {
  const hasData = Boolean(stocktake?.verificationDay || stocktake?.lastStocktakeAt)
  const accuracy = Number(stocktake?.scanRatePercent ?? 0)
  const latestSession = getLatestStocktakeSession(stocktake)
  const durationMinutes = latestSession?.durationMinutes ?? 0

  const findings = [
    {
      key: 'matched',
      label: 'Matched (ERP = physical)',
      value: stocktake?.foundCount ?? 0,
      tone: 'matched',
      prefix: '',
    },
    {
      key: 'surplus',
      label: 'Surplus (extra items found)',
      value: stocktake?.newCount ?? 0,
      tone: 'surplus',
      prefix: '+',
      hideWhenZero: false,
    },
    {
      key: 'missing',
      label: 'Missing (in ERP, not found)',
      value: stocktake?.missingCount ?? 0,
      tone: 'missing',
      prefix: '-',
    },
    {
      key: 'unverified',
      label: 'Unverified (no ERP record)',
      value: Math.max(
        0,
        Number(stocktake?.itemsScanned ?? 0)
          - Number(stocktake?.foundCount ?? 0)
          - Number(stocktake?.newCount ?? 0),
      ),
      tone: 'unverified',
      prefix: '',
      hideWhenZero: true,
    },
  ].filter((row) => !row.hideWhenZero || Number(row.value) > 0)

  return (
    <article className="stocktake-card">
      <header className="stocktake-card__head">
        <DashboardTitleRow>
          <h3>Last stocktake findings</h3>
        </DashboardTitleRow>
      </header>

      <div className="stocktake-card__body">
        {!hasData && (
          <p className="analytics-empty">No stock verification sessions recorded yet.</p>
        )}

        {hasData && (
          <>
            <div className="stocktake-accuracy">
              <span className="stocktake-accuracy__label">Accuracy</span>
              <div className="stocktake-accuracy__track" aria-hidden="true">
                <span
                  className="stocktake-accuracy__fill"
                  style={{ width: `${Math.min(Math.max(accuracy, 0), 100)}%` }}
                />
              </div>
              <strong className="stocktake-accuracy__value dashboard-num">
                {formatAccuracyPercent(accuracy)}
                %
              </strong>
            </div>

            <ul className="stocktake-findings">
              {findings.map((row) => (
                <li key={row.key} className="stocktake-findings__row">
                  <span className="stocktake-findings__label">{row.label}</span>
                  <span className={`stocktake-findings__badge stocktake-findings__badge--${row.tone} dashboard-num`}>
                    {row.prefix}
                    {formatCount(row.value)}
                  </span>
                </li>
              ))}
            </ul>

            <footer className="stocktake-card__footer">
              {durationMinutes > 0 && (
                <>
                  Duration:
                  {' '}
                  {durationMinutes}
                  {' min · '}
                </>
              )}
              {formatStocktakeDate(stocktake.verificationDay || latestSession?.date)}
            </footer>
          </>
        )}
      </div>
    </article>
  )
}

function StocktakeHistory({ stocktake }) {
  const history = stocktake?.history ?? EMPTY_STOCKTAKE.history
  const sessions = history.sessions ?? []

  return (
    <article className="stocktake-card">
      <header className="stocktake-card__head">
        <DashboardTitleRow>
          <h3>Stocktake history</h3>
        </DashboardTitleRow>
        <p className="stocktake-card__subtitle">Last 6 sessions — accuracy %</p>
      </header>

      <div className="stocktake-card__body">
        {!sessions.length && (
          <p className="analytics-empty">Stocktake history will appear after verification sessions.</p>
        )}

        {sessions.length > 0 && (
          <div className="stocktake-history-panel">
            <ul className="stocktake-history">
              {sessions.map((session) => {
                const tone = getStocktakeAccuracyTone(session.accuracyPercent)
                const width = Math.min(Math.max(Number(session.accuracyPercent ?? 0), 0), 100)

                return (
                  <li key={`${session.date}-${session.verificationId}`} className="stocktake-history__row">
                    <span className={`stocktake-history__dot stocktake-history__dot--${tone}`} aria-hidden="true" />
                    <span className="stocktake-history__label">{session.label || formatStocktakeDate(session.date)}</span>
                    <div className="stocktake-history__track" aria-hidden="true">
                      <span
                        className={`stocktake-history__fill stocktake-history__fill--${tone}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <span className={`stocktake-history__value dashboard-num stocktake-history__value--${tone}`}>
                      {formatAccuracyPercent(session.accuracyPercent)}
                      %
                    </span>
                  </li>
                )
              })}
            </ul>

            <div className="stocktake-history__summary">
              <div className="stocktake-history__stat">
                <span>Average accuracy</span>
                <strong className="dashboard-num">
                  {formatAccuracyPercent(history.averageAccuracyPercent)}
                  %
                </strong>
              </div>
              <div className="stocktake-history__stat">
                <span>Avg. duration</span>
                <strong className="dashboard-num">
                  {history.averageDurationMinutes > 0
                    ? `${history.averageDurationMinutes} min`
                    : '—'}
                </strong>
              </div>
              <div className="stocktake-history__stat">
                <span>Frequency</span>
                <strong>{history.frequencyLabel || '—'}</strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

function buildAccuracyTrendRows(sessions) {
  return (sessions || []).map((session) => ({
    label: session.label || formatStocktakeDate(session.date),
    accuracy: Number(session.accuracyPercent ?? 0),
  }))
}

function buildAccuracyYAxis(yMin, yMax) {
  const range = yMax - yMin
  const step = range <= 6 ? 0.5 : range <= 12 ? 1 : 0.5
  const ticks = []
  for (let value = yMin; value <= yMax + 0.001; value += step) {
    ticks.push(Math.round(value * 10) / 10)
  }
  return ticks
}

function buildAccuracyYDomain(chartData) {
  if (!chartData.length) return { yMin: 97, yMax: 100 }

  const values = chartData.map((row) => row.accuracy)
  const minAccuracy = Math.min(...values)
  const maxAccuracy = Math.max(...values)
  const spread = maxAccuracy - minAccuracy

  if (maxAccuracy < 90 || spread < 8) {
    const padding = Math.max(1, spread < 1 ? 2 : spread * 0.35 + 1)
    const yMin = Math.max(0, Math.floor((minAccuracy - padding) * 2) / 2)
    const yMax = Math.min(100, Math.ceil((maxAccuracy + padding) * 2) / 2)
    return { yMin, yMax: Math.max(yMin + 1, yMax) }
  }

  return {
    yMin: Math.max(0, Math.floor(minAccuracy * 2) / 2 - 0.5),
    yMax: 100,
  }
}

function AccuracyTrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const accuracy = Number(payload[0]?.value ?? 0)
  return (
    <div className="accuracy-trend-tooltip">
      <span className="accuracy-trend-tooltip__label">{label}</span>
      <strong className="accuracy-trend-tooltip__value dashboard-num">
        {formatAccuracyPercent(accuracy)}%
      </strong>
    </div>
  )
}

function AccuracyTrendChart({ stocktake }) {
  const chartData = useMemo(
    () => buildAccuracyTrendRows(stocktake?.history?.sessions ?? []),
    [stocktake],
  )

  const { yMin, yMax } = useMemo(() => buildAccuracyYDomain(chartData), [chartData])
  const yTicks = useMemo(() => buildAccuracyYAxis(yMin, yMax), [yMin, yMax])

  if (!chartData.length) {
    return <p className="analytics-empty">Stocktake history will appear after verification sessions.</p>
  }

  return (
    <div className="accuracy-trend-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="accuracy-trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d4af37" stopOpacity={0.3} />
              <stop offset="85%" stopColor="#f5ecd4" stopOpacity={0.1} />
              <stop offset="100%" stopColor="#faf7ef" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#ebe4d8" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#9a8b78', fontWeight: 500 }}
            axisLine={{ stroke: '#e0d8cc' }}
            tickLine={false}
            height={28}
          />
          <YAxis
            domain={[yMin, yMax]}
            ticks={yTicks}
            tick={{ fontSize: 11, fill: '#9a8b78' }}
            axisLine={{ stroke: '#e0d8cc' }}
            tickLine={false}
            width={44}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip content={<AccuracyTrendTooltip />} cursor={{ stroke: 'rgba(184, 134, 11, 0.18)', strokeWidth: 1, strokeDasharray: '4 4' }} />
          <Area
            type="natural"
            dataKey="accuracy"
            fill="url(#accuracy-trend-fill)"
            stroke="none"
            isAnimationActive={false}
          />
          <Line
            type="natural"
            dataKey="accuracy"
            stroke="#d4af37"
            strokeWidth={2.5}
            dot={{ r: 5, fill: '#d4af37', stroke: '#fff', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: '#d4af37', stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
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

function TrendLineXTick({ x, y, payload, chartData, labelKey = 'dayShort', index }) {
  const item = chartData?.[index] ?? chartData?.find((row) => row[labelKey] === payload?.value)
  const isToday = item?.isToday
  const isMonth = labelKey === 'dayMedium' && chartData?.length > 10
  const isLast = index === chartData.length - 1
  const isFirst = index === 0

  let textAnchor = 'middle'
  let dx = 0
  if (isMonth) {
    textAnchor = 'end'
  } else if (isLast) {
    textAnchor = 'end'
    dx = -2
  } else if (isFirst) {
    textAnchor = 'start'
    dx = 2
  }

  return (
    <text
      x={x}
      y={y}
      dx={dx}
      dy={14}
      textAnchor={textAnchor}
      fill={isToday ? '#2d9f5f' : '#6b5a45'}
      fontSize={11}
      fontWeight={isToday ? 700 : 500}
    >
      {payload?.value}
    </text>
  )
}

function TrendLineDot({ cx, cy, payload, dotOnImportOnly = false, uniformDots = false }) {
  if (cx == null || cy == null || !payload) return null
  if (dotOnImportOnly && !payload.hasImport) return null
  if (uniformDots) {
    return <circle cx={cx} cy={cy} r={5} fill="#d4af37" />
  }
  const color = DAY_SALES_BAR_COLORS[payload.dayType] || DAY_SALES_BAR_COLORS.weekday
  const radius = payload.isToday ? 7 : 6
  return <circle cx={cx} cy={cy} r={radius} fill={color} stroke="#fff" strokeWidth={2.5} />
}

function TrendLineValueLabel({ x, y, value, index, chartData, dataKey, dotOnImportOnly }) {
  const row = chartData[index]
  const numericValue = Number(value ?? row?.[dataKey] ?? 0)
  if (!numericValue) return null
  if (dotOnImportOnly && !row?.hasImport) return null

  const isLast = index === chartData.length - 1
  const isFirst = index === 0

  return (
    <text
      x={x}
      y={y}
      dx={isLast ? -6 : isFirst ? 6 : 0}
      dy={-10}
      textAnchor={isLast ? 'end' : isFirst ? 'start' : 'middle'}
      fill="#8b6914"
      fontSize={11}
      fontWeight={700}
      fontFamily="var(--font-numeric)"
    >
      {formatCount(numericValue)}
    </text>
  )
}

function JewelleryTrendLineChart({
  chartData,
  period = 'week',
  dataKey,
  tooltip: TooltipComponent,
  legendPrimaryLabel,
  showValueLabels,
  showArea = false,
  uniformDots = false,
  dotOnImportOnly = false,
  chartHeight = 280,
}) {
  const isMonth = period === 'month'
  const xLabelKey = isMonth ? 'dayMedium' : 'dayShort'
  const showLabels = showValueLabels ?? !isMonth
  const xTickInterval = isMonth ? Math.max(0, Math.floor(chartData.length / 6) - 1) : 0
  const gradientId = `trend-fill-${dataKey}`
  const curveType = showArea ? 'natural' : 'monotone'
  const isCompact = chartHeight < 250

  return (
    <div className={`trend-line-chart${showArea ? ' trend-line-chart--filled' : ''}${isCompact ? ' trend-line-chart--compact' : ''}`}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ComposedChart
          data={chartData}
          margin={{
            top: isCompact ? 28 : 36,
            right: isMonth ? 16 : isCompact ? 20 : 28,
            left: 8,
            bottom: isMonth ? 28 : isCompact ? 8 : 14,
          }}
        >
          {showArea && (
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d4af37" stopOpacity={0.32} />
                <stop offset="85%" stopColor="#f5ecd4" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#faf7ef" stopOpacity={0} />
              </linearGradient>
            </defs>
          )}
          {showArea && (
            <CartesianGrid stroke="#ebe4d8" vertical={false} horizontal />
          )}
          <XAxis
            dataKey={xLabelKey}
            tick={(props) => <TrendLineXTick {...props} chartData={chartData} labelKey={xLabelKey} />}
            axisLine={showArea ? { stroke: '#e0d8cc' } : false}
            tickLine={false}
            interval={xTickInterval}
            height={36}
            angle={isMonth ? -32 : 0}
            textAnchor={isMonth ? 'end' : 'middle'}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#9a8b78' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={52}
          />
          <Tooltip
            content={TooltipComponent}
            cursor={{ stroke: 'rgba(184, 134, 11, 0.18)', strokeWidth: 1, strokeDasharray: '4 4' }}
          />
          {showArea && (
            <Area
              type={curveType}
              dataKey={dataKey}
              fill={`url(#${gradientId})`}
              stroke="none"
              isAnimationActive={false}
            />
          )}
          <Line
            type={curveType}
            dataKey={dataKey}
            stroke="#d4af37"
            strokeWidth={showArea ? 2.5 : 2}
            dot={<TrendLineDot dotOnImportOnly={dotOnImportOnly} uniformDots={uniformDots} />}
            activeDot={{ r: 7, stroke: '#fff', strokeWidth: 2, fill: '#d4af37' }}
          >
            {showLabels && (
              <LabelList
                content={(props) => (
                  <TrendLineValueLabel
                    {...props}
                    chartData={chartData}
                    dataKey={dataKey}
                    dotOnImportOnly={dotOnImportOnly}
                  />
                )}
              />
            )}
          </Line>
        </ComposedChart>
      </ResponsiveContainer>

      <div className="trend-line-legend">
        <span className="trend-line-legend__item">
          <i className="trend-line-legend__swatch trend-line-legend__swatch--primary" />
          {legendPrimaryLabel}
        </span>
        <span className="trend-line-legend__item">
          <i className="trend-line-legend__swatch trend-line-legend__swatch--saturday" />
          Saturday
        </span>
        <span className="trend-line-legend__item">
          <i className="trend-line-legend__swatch trend-line-legend__swatch--today" />
          Today
        </span>
      </div>
    </div>
  )
}

function DaySalesTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  return (
    <div className="chart-tip">
      <p className="chart-tip__title">{item?.day || item?.date}</p>
      {item?.date && <p className="chart-tip__meta">{item.date}</p>}
      <p className="chart-tip__value">
        {formatCount(item?.soldPieces ?? 0)}
        {' '}
        sold pieces
      </p>
    </div>
  )
}

function DayWiseSalesLineChart({ data }) {
  const chartData = buildWeekChartRows(data)
  const hasSales = chartData.some((row) => row.soldPieces > 0)

  if (!hasSales) return <p className="analytics-empty">No sales data for this period.</p>

  return (
    <JewelleryTrendLineChart
      chartData={chartData}
      period="week"
      dataKey="soldPieces"
      tooltip={DaySalesTooltip}
      legendPrimaryLabel="Sold (pieces)"
      showArea
      uniformDots
      chartHeight={220}
    />
  )
}

function DayWiseSalesHeatmap({ data }) {
  const { cells, maxSold } = buildMonthHeatmapRows(data)
  const hasSales = cells.some((cell) => !cell.empty && cell.soldPieces > 0)

  if (!hasSales) return <p className="analytics-empty">No sales data for this period.</p>

  return (
    <div className="day-sales-heatmap">
      <div className="day-sales-heatmap__weekdays">
        {WEEKDAY_HEADERS.map((day) => (
          <span key={day} className="day-sales-heatmap__weekday">{day}</span>
        ))}
      </div>

      <div className="day-sales-heatmap__grid">
        {cells.map((cell, index) => {
          if (cell.empty) {
            return <span key={`empty-${index}`} className="day-sales-heatmap__cell day-sales-heatmap__cell--empty" aria-hidden="true" />
          }

          return (
            <div
              key={cell.date}
              className={`day-sales-heatmap__cell day-sales-heatmap__cell--level-${cell.heatLevel}${cell.isToday ? ' day-sales-heatmap__cell--today' : ''}`}
              title={`${cell.date}: ${formatCount(cell.soldPieces)} pieces`}
            >
              <span className="day-sales-heatmap__day">{cell.dayNum}</span>
              {cell.soldPieces > 0 && (
                <span className="day-sales-heatmap__value">{cell.soldPieces}p</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="day-sales-heatmap__legend">
        <span>Low</span>
        <div className="day-sales-heatmap__scale">
          {[0, 1, 2, 3, 4, 5].map((level) => (
            <i key={level} className={`day-sales-heatmap__scale-swatch day-sales-heatmap__scale-swatch--${level}`} />
          ))}
        </div>
        <span>High{maxSold > 0 ? ` (${formatCount(maxSold)} max)` : ''}</span>
      </div>
    </div>
  )
}

function groupBatchesByDate(apiData) {
  const byDate = {}

  for (const row of apiData || []) {
    const dateKey = row.date
    if (!byDate[dateKey]) {
      byDate[dateKey] = { latest: row, count: 1 }
      continue
    }

    byDate[dateKey].count += 1
    if (Number(row.batchId) > Number(byDate[dateKey].latest.batchId)) {
      byDate[dateKey].latest = row
    }
  }

  return byDate
}

function buildDailyImportDayRows(apiData, dayCount) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayKey = toDateKey(today)
  const byDate = groupBatchesByDate(apiData)

  let lastStock = 0

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (dayCount - 1 - index))
    const dateKey = toDateKey(date)
    const dayType = getDayType(dateKey, todayKey)
    const isToday = dateKey === todayKey
    const weekday = WEEKDAY_HEADERS[date.getDay()]
    const dayNum = date.getDate()
    const month = MONTH_NAMES_SHORT[date.getMonth()]
    const dayGroup = byDate[dateKey]
    const batchRow = dayGroup?.latest
    const hasImport = Boolean(batchRow)

    if (hasImport) {
      lastStock = Number(batchRow.totalStock ?? 0)
    }

    return {
      date: dateKey,
      day: isToday ? 'Today' : `${weekday} ${dayNum} ${month}`,
      dayShort: isToday ? 'Today' : weekday,
      dayMedium: isToday ? 'Today' : `${dayNum} ${month}`,
      totalStock: lastStock,
      estimatedSold: hasImport ? Number(batchRow.estimatedSold ?? 0) : 0,
      batchId: hasImport ? batchRow.batchId : null,
      importCount: dayGroup?.count ?? 0,
      hasImport,
      dayType,
      isToday,
    }
  })
}

function buildDailyImportWeekRows(apiData) {
  return buildDailyImportDayRows(apiData, 7)
}

function buildDailyImportMonthHeatmapRows(apiData) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayKey = toDateKey(today)
  const byDate = groupBatchesByDate(apiData)

  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (29 - index))
    const dateKey = toDateKey(date)
    const dayGroup = byDate[dateKey]
    const hasImport = Boolean(dayGroup)
    const importCount = dayGroup?.count ?? 0
    const totalStock = hasImport ? Number(dayGroup.latest.totalStock ?? 0) : 0

    return {
      date: dateKey,
      dayNum: date.getDate(),
      weekday: date.getDay(),
      importCount,
      totalStock,
      hasImport,
      isToday: dateKey === todayKey,
      empty: false,
    }
  })

  const maxStock = Math.max(...days.map((row) => row.totalStock), 0)
  const enrichedDays = days.map((row) => ({
    ...row,
    heatLevel: row.hasImport ? getHeatLevel(row.totalStock, maxStock) : 0,
  }))

  const leading = Array.from({ length: enrichedDays[0].weekday }, () => ({ empty: true }))
  const cells = [...leading, ...enrichedDays]

  while (cells.length % 7 !== 0) {
    cells.push({ empty: true })
  }

  return { cells, maxStock }
}

function DailyImportTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  return (
    <div className="chart-tip">
      <p className="chart-tip__title">{item?.day || item?.date}</p>
      {item?.date && <p className="chart-tip__meta">{item.date}</p>}
      {item?.hasImport && item?.importCount > 1 && (
        <p className="chart-tip__meta">
          {item.importCount}
          {' '}
          imports this day
        </p>
      )}
      {item?.hasImport && item?.batchId != null && (
        <p className="chart-tip__meta">
          Latest batch #
          {item.batchId}
        </p>
      )}
      {!item?.hasImport && item?.totalStock > 0 && (
        <p className="chart-tip__meta">No new import — carried stock</p>
      )}
      <p className="chart-tip__value">
        {formatCount(item?.totalStock ?? 0)}
        {' '}
        total stock
      </p>
      {item?.hasImport && (
        <p className="chart-tip__meta">
          Est. sold:
          {' '}
          {formatCount(item?.estimatedSold ?? 0)}
        </p>
      )}
    </div>
  )
}

function DailyImportsBarChart({ data }) {
  const chartData = buildDailyImportWeekRows(data).map((row) => ({
    ...row,
    barStock: row.hasImport ? row.totalStock : 0,
  }))
  const hasImports = (data || []).length > 0

  if (!hasImports) {
    return <p className="analytics-empty">No import data for this period.</p>
  }

  return (
    <div className="day-sales-bar-chart">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 22, right: 8, left: 0, bottom: 6 }}>
          <XAxis
            dataKey="dayShort"
            tick={(props) => <TrendLineXTick {...props} chartData={chartData} labelKey="dayShort" />}
            axisLine={false}
            tickLine={false}
            interval={0}
            height={36}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#9a8b78' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={52}
          />
          <Tooltip content={<DailyImportTooltip />} cursor={{ fill: 'rgba(184, 134, 11, 0.08)' }} />
          <Bar dataKey="barStock" radius={[8, 8, 0, 0]} maxBarSize={42}>
            {chartData.map((entry) => (
              <Cell key={entry.date} fill={DAY_SALES_BAR_COLORS[entry.dayType]} />
            ))}
            <LabelList
              dataKey="barStock"
              position="top"
              formatter={(value) => (value > 0 ? formatCount(value) : '')}
              fill="#8b6914"
              fontSize={11}
              fontWeight={700}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="day-sales-legend">
        <span className="day-sales-legend__item">
          <i className="day-sales-legend__swatch day-sales-legend__swatch--weekday" />
          Stock per batch
        </span>
        <span className="day-sales-legend__item">
          <i className="day-sales-legend__swatch day-sales-legend__swatch--saturday" />
          Saturday
        </span>
        <span className="day-sales-legend__item">
          <i className="day-sales-legend__swatch day-sales-legend__swatch--today" />
          Today
        </span>
      </div>
    </div>
  )
}

function DailyImportsCalendar({ data }) {
  const { cells, maxStock } = buildDailyImportMonthHeatmapRows(data)
  const hasImports = (data || []).length > 0

  if (!hasImports) {
    return <p className="analytics-empty">No import data for this period.</p>
  }

  return (
    <div className="day-sales-heatmap daily-imports-calendar">
      <div className="day-sales-heatmap__weekdays">
        {WEEKDAY_HEADERS.map((day) => (
          <span key={day} className="day-sales-heatmap__weekday">{day}</span>
        ))}
      </div>

      <div className="day-sales-heatmap__grid">
        {cells.map((cell, index) => {
          if (cell.empty) {
            return <span key={`empty-${index}`} className="day-sales-heatmap__cell day-sales-heatmap__cell--empty" aria-hidden="true" />
          }

          const title = cell.hasImport
            ? `${cell.date}: ${cell.importCount} import${cell.importCount === 1 ? '' : 's'} · ${formatCount(cell.totalStock)} stock`
            : `${cell.date}: no import`

          return (
            <div
              key={cell.date}
              className={`day-sales-heatmap__cell day-sales-heatmap__cell--level-${cell.heatLevel}${cell.isToday ? ' day-sales-heatmap__cell--today' : ''}`}
              title={title}
            >
              <span className="day-sales-heatmap__day">{cell.dayNum}</span>
              {cell.hasImport && (
                <span className="day-sales-heatmap__value">{formatHeatmapCount(cell.totalStock)}</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="day-sales-heatmap__legend">
        <span>No import</span>
        <div className="day-sales-heatmap__scale">
          {[0, 1, 2, 3, 4, 5].map((level) => (
            <i key={level} className={`day-sales-heatmap__scale-swatch day-sales-heatmap__scale-swatch--${level}`} />
          ))}
        </div>
        <span>
          More stock
          {maxStock > 0 ? ` (${formatHeatmapCount(maxStock)} max/day)` : ''}
        </span>
      </div>
    </div>
  )
}

function DailyImportsCard({
  period,
  counter,
  onPeriodChange,
  onCounterChange,
  loading,
  error,
  data,
}) {
  return (
    <article className="analytics-tile analytics-tile--wide day-sales-card">
      <header className="day-sales-card__head">
        <DashboardTitleRow>
          <h3 className="day-sales-card__title">Daily imports — stock per batch</h3>
        </DashboardTitleRow>
        <div className="day-sales-card__toolbar">
          <div className="day-sales-pills">
            {DAILY_IMPORT_COUNTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`day-sales-pill${counter === option.value ? ' day-sales-pill--active' : ''}`}
                onClick={() => onCounterChange(option.value)}
                disabled={loading}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="day-sales-card__actions">
            <div className="day-sales-toggle" role="group" aria-label="Import period">
              {DAY_SALES_PERIODS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`day-sales-toggle__btn${period === option.value ? ' day-sales-toggle__btn--active' : ''}`}
                  onClick={() => onPeriodChange(option.value)}
                  disabled={loading}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="analytics-tile__body day-sales-card__body">
        {loading && <p className="analytics-empty">Loading daily imports…</p>}
        {!loading && error && <p className="analytics-empty">{error}</p>}
        {!loading && !error && period === 'week' && <DailyImportsBarChart data={data} />}
        {!loading && !error && period === 'month' && <DailyImportsCalendar data={data} />}
      </div>
    </article>
  )
}

function CounterDisplayAccuracyPanel({ counterAccuracy, loading }) {
  const locations = counterAccuracy?.locations ?? []
  const hasData = locations.length > 0

  if (loading) {
    return <p className="analytics-empty">Loading counter accuracy…</p>
  }

  if (!hasData) {
    return <p className="analytics-empty">Counter accuracy will appear after stock verification.</p>
  }

  return (
    <div className="counter-display-panel">
      <ul className="counter-display-panel__list">
        {locations.map((row) => {
          const tone = getStocktakeAccuracyTone(row.accuracyPercent)
          const label = row.label || row.name

          return (
            <li key={row.name} className="counter-display-panel__row">
              <span className="counter-display-panel__label" title={label}>{label}</span>
              <span className={`counter-display-panel__value dashboard-num counter-display-panel__value--${tone}`}>
                {formatAccuracyPercent(row.accuracyPercent)}%
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ErpPhysicalBarChart({ data, compact = false, singleBranch = false }) {
  const visibleData = data.filter((row) => row.erp > 0 || row.physical > 0)

  if (!visibleData.length) {
    return <p className="analytics-empty">No branch comparison data available.</p>
  }

  const actualValues = visibleData.flatMap((row) => [row.erp, row.physical])
  const actualMax = Math.max(...actualValues, 1)
  const positiveValues = actualValues.filter((value) => value > 0)
  const actualMin = positiveValues.length ? Math.min(...positiveValues) : 1
  const useLogScale = !singleBranch
    && visibleData.length > 1
    && actualMax / Math.max(actualMin, 1) > 50

  const chartRows = visibleData.map((row) => ({
    ...row,
    axisLabel: singleBranch ? row.name : row.shortName,
    erpChart: useLogScale ? Math.max(row.erp, 1) : row.erp,
    physicalChart: useLogScale ? Math.max(row.physical, 1) : row.physical,
  }))

  const maxValue = useLogScale
    ? Math.max(...chartRows.flatMap((row) => [row.erpChart, row.physicalChart]), 1)
    : Math.max(actualMax, 1)

  const chartHeight = singleBranch
    ? 168
    : compact
      ? 148
      : Math.min(188, Math.max(132, 88 + chartRows.length * 32))

  return (
    <div className={`erp-physical-chart${singleBranch ? ' erp-physical-chart--single' : ''}`}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={chartRows}
          margin={{ top: 8, right: 12, left: 4, bottom: singleBranch ? 8 : 0 }}
          barGap={singleBranch ? 10 : 4}
          barCategoryGap={singleBranch ? '32%' : '20%'}
        >
          <CartesianGrid stroke="#ebe4d8" vertical={false} />
          <XAxis
            dataKey="axisLabel"
            tick={{ fontSize: 11, fill: '#9a8b78', fontWeight: 500 }}
            axisLine={{ stroke: '#e0d8cc' }}
            tickLine={false}
            height={singleBranch ? 36 : 28}
            interval={0}
          />
          <YAxis
            scale={useLogScale ? 'log' : 'linear'}
            domain={useLogScale ? [1, maxValue] : [0, Math.ceil(maxValue * 1.12)]}
            allowDataOverflow={useLogScale}
            tick={{ fontSize: 11, fill: '#9a8b78' }}
            axisLine={{ stroke: '#e0d8cc' }}
            tickLine={false}
            width={46}
            tickFormatter={formatHeatmapCount}
          />
          <Tooltip
            formatter={(value, name, item) => {
              const actual = name === 'ERP'
                ? item.payload.erp
                : item.payload.physical
              return [formatCount(actual), name]
            }}
            contentStyle={{
              borderRadius: 10,
              border: '1px solid #ebe3d6',
              fontSize: 12,
            }}
          />
          <Bar
            dataKey="erpChart"
            name="ERP"
            fill="#8ecae6"
            radius={[4, 4, 0, 0]}
            maxBarSize={singleBranch ? 42 : 26}
          />
          <Bar
            dataKey="physicalChart"
            name="Physical"
            fill="#21a371"
            radius={[4, 4, 0, 0]}
            maxBarSize={singleBranch ? 42 : 26}
          />
        </BarChart>
      </ResponsiveContainer>
      <div className="erp-physical-chart__legend" aria-hidden="true">
        <span><i className="erp-physical-chart__swatch erp-physical-chart__swatch--erp" /> ERP</span>
        <span><i className="erp-physical-chart__swatch erp-physical-chart__swatch--physical" /> Physical</span>
      </div>
    </div>
  )
}

function ErpPhysicalSummary({ erpVsPhysical, branchName = null }) {
  const erp = Number(erpVsPhysical?.erp ?? 0)
  const physical = Number(erpVsPhysical?.physical ?? 0)
  const matched = Number(erpVsPhysical?.matched ?? 0)

  return (
    <div className="insight-erp-summary" aria-label="ERP vs physical summary">
      {branchName ? (
        <p className="insight-erp-summary__scope">{branchName}</p>
      ) : (
        <p className="insight-erp-summary__scope">All branches</p>
      )}
      <div className="insight-erp-summary__item">
        <span className="insight-erp-summary__label">ERP items</span>
        <strong className="insight-erp-summary__value dashboard-num">{formatCount(erp)}</strong>
      </div>
      <div className="insight-erp-summary__item insight-erp-summary__item--physical">
        <span className="insight-erp-summary__label">Physical scan</span>
        <strong className="insight-erp-summary__value dashboard-num">{formatCount(physical)}</strong>
      </div>
      <div className="insight-erp-summary__item insight-erp-summary__item--matched">
        <span className="insight-erp-summary__label">Matched</span>
        <strong className="insight-erp-summary__value dashboard-num">{formatCount(matched)}</strong>
      </div>
    </div>
  )
}

function MultiBranchComparisonCard({ data, loading, error }) {
  const branches = data?.branches ?? []
  const erpVsPhysical = data?.erpVsPhysical
  const [selectedBranchId, setSelectedBranchId] = useState(null)

  useEffect(() => {
    if (selectedBranchId == null) {
      return
    }

    const stillExists = branches.some((branch) => branch.id === selectedBranchId)
    if (!stillExists) {
      setSelectedBranchId(null)
    }
  }, [branches, selectedBranchId])

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) ?? null,
    [branches, selectedBranchId],
  )

  const displaySummary = useMemo(() => {
    if (!selectedBranch) {
      return erpVsPhysical
    }

    const erp = Number(selectedBranch.totalExpected ?? selectedBranch.itemCount ?? 0)
    const physical = Number(selectedBranch.itemsScanned ?? 0)
    const matched = Number(selectedBranch.foundCount ?? 0)

    return {
      erp,
      physical,
      matched,
      difference: erp - physical,
      missing: Number(selectedBranch.missingCount ?? 0),
      new: Number(selectedBranch.newCount ?? 0),
    }
  }, [selectedBranch, erpVsPhysical])

  const chartData = useMemo(
    () => {
      const source = selectedBranch ? [selectedBranch] : branches

      return source.map((branch, index) => ({
        name: branch.name,
        shortName: shortBranchLabel(branch.name),
        erp: Number(branch.totalExpected ?? branch.itemCount ?? 0),
        physical: Number(branch.itemsScanned ?? 0),
        color: BRANCH_CHART_COLORS[index % BRANCH_CHART_COLORS.length],
      }))
    },
    [branches, selectedBranch],
  )

  const toggleBranchSelection = (branchId) => {
    setSelectedBranchId((current) => (current === branchId ? null : branchId))
  }

  return (
    <article className="analytics-tile insight-card insight-card--branch">
      <header className="analytics-tile__head">
        <DashboardTitleRow>
          <h3>Multi-branch comparison</h3>
        </DashboardTitleRow>
      </header>

      <div className="analytics-tile__body insight-card__body">
        {loading && <p className="analytics-empty">Loading branch comparison…</p>}
        {!loading && error && <p className="analytics-empty">{error}</p>}
        {!loading && !error && (
          <>
            <section className="insight-card__section">
              <p className="insight-card__eyebrow">All branches — last stocktake accuracy</p>
              {!branches.length ? (
                <p className="analytics-empty insight-card__empty">Branch comparison will appear after stock verification.</p>
              ) : (
                <ul className="branch-compare-list">
                  {branches.map((branch, index) => {
                    const tone = getStocktakeAccuracyTone(branch.accuracyPercent)
                    const color = BRANCH_CHART_COLORS[index % BRANCH_CHART_COLORS.length]
                    const itemCount = Number(branch.itemCount ?? branch.totalExpected ?? 0)

                    return (
                      <li key={branch.id ?? branch.name}>
                        <button
                          type="button"
                          className={`branch-compare-list__row${selectedBranchId === branch.id ? ' branch-compare-list__row--selected' : ''}`}
                          onClick={() => toggleBranchSelection(branch.id)}
                          aria-pressed={selectedBranchId === branch.id}
                        >
                          <span className="branch-compare-list__dot" style={{ background: color }} aria-hidden="true" />
                          <span className="branch-compare-list__name" title={branch.name}>{branch.name}</span>
                          <span className="branch-compare-list__items dashboard-num">
                            {formatCount(itemCount)}
                            {' '}
                            items
                          </span>
                          <span className={`branch-compare-list__accuracy dashboard-num branch-compare-list__accuracy--${tone}`}>
                            {formatAccuracyPercent(branch.accuracyPercent)}
                            %
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section className="insight-card__section insight-card__section--chart">
              <p className="insight-card__eyebrow">ERP vs. physical item count</p>
              <ErpPhysicalSummary
                erpVsPhysical={displaySummary}
                branchName={selectedBranch?.name ?? null}
              />
              <ErpPhysicalBarChart
                data={chartData}
                compact
                singleBranch={Boolean(selectedBranch)}
              />
            </section>
          </>
        )}
      </div>
    </article>
  )
}

function StockMovementCard({ data, loading, error }) {
  const slowItems = data?.slowMovers?.items ?? []
  const fastItems = data?.fastMovers?.items ?? []
  const slowDays = data?.slowMovers?.thresholdDays ?? 60
  const fastDays = data?.fastMovers?.periodDays ?? 30
  const slowTotalPieces = slowItems.reduce((sum, item) => sum + Number(item.pieceCount ?? 0), 0)
  const fastTotalRestocked = fastItems.reduce(
    (sum, item) => sum + Number(item.restockedPieces || item.restockedTags || 0),
    0,
  )
  const showMovementSummary = slowItems.length > 0 || fastItems.length > 0

  return (
    <article className="analytics-tile insight-card insight-card--movement">
      <header className="analytics-tile__head">
        <DashboardTitleRow>
          <h3>Stock movement</h3>
        </DashboardTitleRow>
      </header>

      <div className="analytics-tile__body insight-card__body">
        {loading && <p className="analytics-empty">Loading stock movement…</p>}
        {!loading && error && <p className="analytics-empty">{error}</p>}
        {!loading && !error && (
          <>
            <section className="insight-card__section">
              <p className="insight-card__eyebrow">
                Slow movers — not seen in
                {' '}
                {slowDays}
                + days
              </p>
              {!slowItems.length ? (
                <p className="analytics-empty insight-card__empty">No slow-moving products found.</p>
              ) : (
                <ul className="movement-list">
                  {slowItems.map((item) => (
                    <li key={item.productName} className="movement-list__row movement-list__row--slow">
                      <span className="movement-list__name" title={item.productName}>{item.productName}</span>
                      <span className="movement-list__count dashboard-num">
                        {formatCount(item.pieceCount)}
                        {' '}
                        pcs
                      </span>
                      <span className="movement-pill movement-pill--slow dashboard-num">
                        {formatCount(item.avgDaysSinceMovement)}
                        d avg
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {showMovementSummary && (
                <div className="movement-summary-strip" aria-label="Stock movement summary">
                  <div className="movement-summary-strip__item movement-summary-strip__item--slow">
                    <span className="movement-summary-strip__label">Slow inventory</span>
                    <strong className="movement-summary-strip__value dashboard-num">
                      {formatCount(slowTotalPieces)}
                      {' '}
                      pcs
                    </strong>
                  </div>
                  <div className="movement-summary-strip__item movement-summary-strip__item--fast">
                    <span className="movement-summary-strip__label">
                      Restocked (last
                      {' '}
                      {fastDays}
                      {' '}
                      days)
                    </span>
                    <strong className="movement-summary-strip__value dashboard-num">
                      +
                      {formatCount(fastTotalRestocked)}
                      {' '}
                      pcs
                    </strong>
                  </div>
                </div>
              )}
            </section>

            <section className="insight-card__section insight-card__section--chart">
              <p className="insight-card__eyebrow">
                Fast movers — top restocked (last
                {' '}
                {fastDays}
                {' '}
                days)
              </p>
              {!fastItems.length ? (
                <p className="analytics-empty insight-card__empty">No fast-moving products recorded yet.</p>
              ) : (
                <ul className="movement-list">
                  {fastItems.map((item) => (
                    <li key={item.productName} className="movement-list__row">
                      <span className="movement-list__name" title={item.productName}>{item.productName}</span>
                      <span className="movement-pill movement-pill--fast dashboard-num">
                        +
                        {formatCount(item.restockedPieces || item.restockedTags)}
                        {' '}
                        restocked
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </article>
  )
}

function DayWiseSalesCard({
  period,
  counter,
  onPeriodChange,
  onCounterChange,
  loading,
  error,
  data,
  totalSoldPieces,
  branchLabel = 'All branches',
}) {
  return (
    <article className="analytics-tile day-sales-card">
      <header className="day-sales-card__head">
        <DashboardTitleRow>
          <h3 className="day-sales-card__title">Day-wise sales — pieces sold</h3>
        </DashboardTitleRow>
        <p className="day-sales-card__scope">{branchLabel}</p>
        <div className="day-sales-card__toolbar">
          <div className="day-sales-pills">
            {DAY_SALES_COUNTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`day-sales-pill${counter === option.value ? ' day-sales-pill--active' : ''}`}
                onClick={() => onCounterChange(option.value)}
                disabled={loading}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="day-sales-card__actions">
            <div className="day-sales-toggle" role="group" aria-label="Sales period">
              {DAY_SALES_PERIODS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`day-sales-toggle__btn${period === option.value ? ' day-sales-toggle__btn--active' : ''}`}
                  onClick={() => onPeriodChange(option.value)}
                  disabled={loading}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <span className="day-sales-total">
              Total:
              {' '}
              <strong>{formatCount(totalSoldPieces)}</strong>
              {' '}
              pieces
            </span>
          </div>
        </div>
      </header>

      <div className="analytics-tile__body day-sales-card__body">
        {loading && <p className="analytics-empty">Loading day-wise sales…</p>}
        {!loading && error && <p className="analytics-empty">{error}</p>}
        {!loading && !error && period === 'week' && <DayWiseSalesLineChart data={data} />}
        {!loading && !error && period === 'month' && <DayWiseSalesHeatmap data={data} />}
      </div>
    </article>
  )
}

function ProductCategoryDonut({ data, totalPieces }) {
  const { rows, total } = useMemo(
    () => buildCategoryChartRows(data, totalPieces),
    [data, totalPieces],
  )

  if (!rows.length) return <p className="analytics-empty">No product category data available.</p>

  return (
    <div className="category-mix-donut">
      <ul className="category-mix-donut__legend" aria-label="Category legend">
        {rows.map((row) => (
          <li key={row.name}>
            <span className="category-mix-donut__swatch" style={{ background: row.color }} aria-hidden="true" />
            <span className="category-mix-donut__name" title={row.name}>{row.name}</span>
            <span className="category-mix-donut__pct">{row.percent}%</span>
          </li>
        ))}
      </ul>

      <div className="category-mix-donut__chart">
        <div className="category-mix-donut__chart-visual">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={rows}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={68}
                outerRadius={98}
                paddingAngle={2}
                stroke="#fff"
                strokeWidth={2}
              >
                {rows.map((row) => (
                  <Cell key={row.name} fill={row.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatCount(value)}
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid #ebe3d6',
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="category-mix-donut__center" aria-hidden="true">
            <strong>{formatCount(total)}</strong>
            <span>Items</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function CategoryBreakdownTable({ data, totalPieces }) {
  const { rows } = useMemo(
    () => buildCategoryChartRows(data, totalPieces),
    [data, totalPieces],
  )

  if (!rows.length) return <p className="analytics-empty">No product category data available.</p>

  return (
    <div className="category-breakdown-table">
      <div className="category-breakdown-table__header" aria-hidden="true">
        <span>Category</span>
        <span>Items</span>
        <span>%</span>
      </div>
      <ul className="category-breakdown-table__list">
        {rows.map((row) => (
          <li key={row.name} className="category-breakdown-table__row">
            <span className="category-breakdown-table__category">
              <span className="category-breakdown-table__swatch" style={{ background: row.color }} aria-hidden="true" />
              <span title={row.name}>{row.name}</span>
            </span>
            <span className="category-breakdown-table__count">{formatCount(row.count)}</span>
            <span className="category-breakdown-table__pct">{row.percent}%</span>
          </li>
        ))}
      </ul>
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

function SmartAlertIcon({ type }) {
  if (type === 'error') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === 'warning') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 4.5L3.5 19.5h17L12 4.5z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M12 10v4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="17" r="0.9" fill="currentColor" />
      </svg>
    )
  }

  if (type === 'time') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="13" r="7" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 10v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M9 3h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 10v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.5" r="0.9" fill="currentColor" />
    </svg>
  )
}

function getSmartAlertTone(alert) {
  const severity = alert?.severity ?? 'info'
  if (severity === 'error') return 'error'
  if (severity === 'warning') return 'warning'
  if (severity === 'time') return 'notice'
  return 'info'
}

function SmartAlertsCard({ data, loading, error }) {
  const alerts = data?.alerts ?? []

  return (
    <article className="analytics-tile smart-alerts-card">
      <header className="analytics-tile__head">
        <DashboardTitleRow>
          <h3>Smart alerts</h3>
        </DashboardTitleRow>
      </header>

      <div className="analytics-tile__body smart-alerts-card__body">
        {loading && <p className="analytics-empty">Loading smart alerts…</p>}
        {!loading && error && <p className="analytics-empty">{error}</p>}
        {!loading && !error && !alerts.length && (
          <p className="analytics-empty smart-alerts-card__empty">
            No active alerts — stock verification looks healthy.
          </p>
        )}
        {!loading && !error && alerts.length > 0 && (
          <ul className="smart-alerts-list" aria-label="Smart alerts">
            {alerts.map((alert) => {
              const tone = getSmartAlertTone(alert)
              const iconType = alert.icon || (tone === 'notice' ? 'time' : tone)
              return (
                <li key={alert.id} className={`smart-alert smart-alert--${tone}`}>
                  <span className={`smart-alert__icon smart-alert__icon--${tone}`} aria-hidden="true">
                    <SmartAlertIcon type={iconType} />
                  </span>
                  <p className="smart-alert__text">
                    <strong>{alert.title}</strong>
                    {alert.message ? (
                      <>
                        {' '}
                        —
                        {' '}
                        {alert.message}
                      </>
                    ) : null}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </article>
  )
}

function AnalyticsTile({ title, subtitle, children, wide = false }) {
  return (
    <article className={`analytics-tile${wide ? ' analytics-tile--wide' : ''}`}>
      <header className="analytics-tile__head">
        <DashboardTitleRow>
          <h3>{title}</h3>
        </DashboardTitleRow>
        <p>{subtitle}</p>
      </header>
      <div className="analytics-tile__body">{children}</div>
    </article>
  )
}

function buildMetricCards(totals, stocktake, verification = EMPTY_VERIFICATION) {
  const totalTags = Number(totals?.totalTags ?? 0)
  const totalFound = Number(verification?.totalFound ?? 0)
  const totalMissing = Number(verification?.totalMissing ?? 0)
  const scanRate = totalTags > 0
    ? Number(((totalFound / totalTags) * 100).toFixed(2))
    : 0

  return [
    {
      key: 'categories',
      label: 'Categories',
      value: formatCount(totals.productGroups),
      hint: 'Product types',
      variant: 'gold',
    },
    {
      key: 'subproducts',
      label: 'Sub-products',
      value: formatCount(totals.subProducts),
      hint: 'Variants',
      variant: 'blue',
    },
    {
      key: 'erp',
      label: 'Total items (ERP)',
      value: formatCount(totalTags),
      variant: 'teal',
    },
    {
      key: 'scanned',
      label: 'Items scanned',
      value: formatCount(totalFound),
      hint: `${formatAccuracyPercent(scanRate)}% scan rate`,
      variant: 'green',
      hintTone: scanRate > 0 ? 'success' : null,
    },
    {
      key: 'discrepancies',
      label: 'Missing items',
      value: formatCount(totalMissing),
      hint: 'In ERP, not found',
      variant: 'red',
      hintTone: totalMissing > 0 ? 'danger' : null,
    },
    {
      key: 'stocktakes',
      label: 'Stocktakes / month',
      value: formatCount(stocktake?.stocktakesThisMonth ?? 0),
      hint: stocktake?.lastStocktakeLabel
        ? `Last: ${stocktake.lastStocktakeLabel}`
        : 'No stocktake yet',
      variant: 'purple',
    },
  ]
}

function MetricTrendIcon({ direction }) {
  if (direction === 'up') {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MetricCard({ label, value, hint, variant, hintTone }) {
  return (
    <div className={`dashboard-metric dashboard-metric--${variant}`}>
      <p className="dashboard-metric__label">{label}</p>
      <p className="dashboard-metric__value dashboard-num">{value}</p>
      {hint ? (
        <p className={`dashboard-metric__hint${hintTone ? ` dashboard-metric__hint--${hintTone}` : ''}`}>
          {hintTone && <MetricTrendIcon direction={hintTone === 'success' ? 'up' : 'down'} />}
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="dashboard">
      {/* Hero skeleton */}
      <section className="skeleton-hero" aria-hidden="true">
        <div className="skeleton-hero__content">
          <span className="skeleton skeleton-hero__badge" />
          <span className="skeleton skeleton-hero__title-line skeleton-hero__title-line--short" />
          <span className="skeleton skeleton-hero__title-line skeleton-hero__title-line--long" />
          <span className="skeleton skeleton-hero__subtitle" />
        </div>
        <div className="skeleton-hero__rates">
          <span className="skeleton skeleton-hero__rate-label" />
          <div className="skeleton-hero__rate-card">
            <span className="skeleton skeleton-hero__rate-icon" />
            <div className="skeleton-hero__rate-info">
              <span className="skeleton skeleton-hero__rate-value" />
              <span className="skeleton skeleton-hero__rate-sub" />
            </div>
          </div>
          <div className="skeleton-hero__rate-card">
            <span className="skeleton skeleton-hero__rate-icon" />
            <div className="skeleton-hero__rate-info">
              <span className="skeleton skeleton-hero__rate-value" />
              <span className="skeleton skeleton-hero__rate-sub" />
            </div>
          </div>
        </div>
      </section>

      {/* Section header skeleton */}
      <div className="skeleton-section-header" aria-hidden="true">
        <span className="skeleton skeleton-section-header__title" />
        <span className="skeleton skeleton-section-header__badge" />
      </div>

      {/* Stat cards skeleton */}
      <div className="skeleton-metrics" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton-metric">
            <span className="skeleton skeleton-metric__label" />
            <span className="skeleton skeleton-metric__value" />
            <span className="skeleton skeleton-metric__hint" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const {
    operationalValue,
    operationalBranchId,
    isAllBranches,
    sessionBranches,
  } = useBranchScope()
  const user = getUser()
  const [summary, setSummary] = useState(null)
  const [verification, setVerification] = useState(EMPTY_VERIFICATION)
  const [stocktake, setStocktake] = useState(EMPTY_STOCKTAKE)
  const [counterAccuracy, setCounterAccuracy] = useState(EMPTY_COUNTER_ACCURACY)
  const [topSoldProducts, setTopSoldProducts] = useState([])
  const [topSoldNotice, setTopSoldNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [topSoldLoading, setTopSoldLoading] = useState(true)
  const [salesPeriod, setSalesPeriod] = useState('week')
  const [salesCounter, setSalesCounter] = useState('all')
  const [dayWiseSales, setDayWiseSales] = useState({ data: [], totalSoldPieces: 0 })
  const [dayWiseLoading, setDayWiseLoading] = useState(true)
  const [dayWiseError, setDayWiseError] = useState('')

  const dayWiseBranchLabel = useMemo(() => {
    if (isAllBranches) {
      return 'All branches'
    }

    const branch = sessionBranches.find((item) => item.id === operationalBranchId)
    return branch?.name ?? 'Selected branch'
  }, [isAllBranches, operationalBranchId, sessionBranches])
  const [importPeriod, setImportPeriod] = useState('week')
  const [importCounter, setImportCounter] = useState('ALL')
  const [dailyImports, setDailyImports] = useState({ data: [] })
  const [dailyImportsLoading, setDailyImportsLoading] = useState(true)
  const [dailyImportsError, setDailyImportsError] = useState('')
  const [error, setError] = useState('')
  const [branchComparison, setBranchComparison] = useState(null)
  const [stockMovement, setStockMovement] = useState(null)
  const [branchComparisonLoading, setBranchComparisonLoading] = useState(true)
  const [branchComparisonError, setBranchComparisonError] = useState('')
  const [stockMovementLoading, setStockMovementLoading] = useState(true)
  const [stockMovementError, setStockMovementError] = useState('')
  const [smartAlerts, setSmartAlerts] = useState(null)
  const [smartAlertsLoading, setSmartAlertsLoading] = useState(true)
  const [smartAlertsError, setSmartAlertsError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      try {
        const { inventory, verification } = await fetchDashboard()

        if (!cancelled) {
          setSummary(inventory)
          setVerification({
            totalFound: Number(verification?.totalFound ?? 0),
            totalMissing: Number(verification?.totalMissing ?? 0),
            totalNew: Number(verification?.totalNew ?? 0),
            totalTags: Number(verification?.totalTags ?? 0),
          })
          setStocktake(verification?.stocktake ?? EMPTY_STOCKTAKE)
          setCounterAccuracy(verification?.counterAccuracy ?? EMPTY_COUNTER_ACCURACY)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Unable to load dashboard. Please try again.')
          setSummary(null)
          setVerification(EMPTY_VERIFICATION)
          setStocktake(EMPTY_STOCKTAKE)
          setCounterAccuracy(EMPTY_COUNTER_ACCURACY)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [operationalValue])

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
            setTopSoldNotice('No sold products recorded yet across import batches.')
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
  }, [operationalValue])

  useEffect(() => {
    let cancelled = false

    async function loadDayWiseSales() {
      setDayWiseLoading(true)
      setDayWiseError('')

      try {
        const result = await fetchDayWiseSales({
          period: salesPeriod,
          counter: salesCounter,
        })

        if (!cancelled) {
          setDayWiseSales(result)
        }
      } catch (err) {
        if (!cancelled) {
          setDayWiseSales({ data: [], totalSoldPieces: 0 })
          setDayWiseError(err.message || 'Failed to load day-wise sales.')
        }
      } finally {
        if (!cancelled) setDayWiseLoading(false)
      }
    }

    if (!loading && summary) {
      loadDayWiseSales()
    }

    return () => { cancelled = true }
  }, [loading, summary, salesPeriod, salesCounter, operationalValue])

  useEffect(() => {
    let cancelled = false

    async function loadDailyImports() {
      setDailyImportsLoading(true)
      setDailyImportsError('')

      try {
        const result = await fetchDailyImports({
          period: importPeriod,
          counter: importCounter,
        })

        if (!cancelled) {
          setDailyImports(result)
        }
      } catch (err) {
        if (!cancelled) {
          setDailyImports({ data: [] })
          setDailyImportsError(err.message || 'Failed to load daily imports.')
        }
      } finally {
        if (!cancelled) setDailyImportsLoading(false)
      }
    }

    if (!loading && summary) {
      loadDailyImports()
    }

    return () => { cancelled = true }
  }, [loading, summary, importPeriod, importCounter, operationalValue])

  useEffect(() => {
    let cancelled = false

    async function loadBranchComparison() {
      setBranchComparisonLoading(true)
      setBranchComparisonError('')

      try {
        const branchData = await fetchBranchComparison()
        if (!cancelled) {
          setBranchComparison(branchData)
        }
      } catch (err) {
        if (!cancelled) {
          setBranchComparison(null)
          setBranchComparisonError(err.message || 'Failed to load branch comparison.')
        }
      } finally {
        if (!cancelled) setBranchComparisonLoading(false)
      }
    }

    loadBranchComparison()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadStockMovement() {
      setStockMovementLoading(true)
      setStockMovementError('')

      try {
        const movementData = await fetchStockMovement({ limit: 5 })
        if (!cancelled) {
          setStockMovement(movementData)
        }
      } catch (err) {
        if (!cancelled) {
          setStockMovement(null)
          setStockMovementError(err.message || 'Failed to load stock movement.')
        }
      } finally {
        if (!cancelled) setStockMovementLoading(false)
      }
    }

    loadStockMovement()
    return () => { cancelled = true }
  }, [operationalValue])

  useEffect(() => {
    let cancelled = false

    async function loadSmartAlerts() {
      setSmartAlertsLoading(true)
      setSmartAlertsError('')

      try {
        const alertsData = await fetchSmartAlerts()
        if (!cancelled) {
          setSmartAlerts(alertsData)
        }
      } catch (err) {
        if (!cancelled) {
          setSmartAlerts(null)
          setSmartAlertsError(err.message || 'Failed to load smart alerts.')
        }
      } finally {
        if (!cancelled) setSmartAlertsLoading(false)
      }
    }

    loadSmartAlerts()
    return () => { cancelled = true }
  }, [operationalValue])

  const totals = summary?.totals ?? {
    totalTags: 0,
    totalPieces: 0,
    totalGrossWt: 0,
    totalNetWt: 0,
    productGroups: 0,
    subProducts: 0,
    counters: 0,
  }

  const metricCards = buildMetricCards(totals, stocktake, verification)

  const canViewDashboard = hasPermission('dashboard.view', user)

  const metricPermissionByKey = {
    categories: 'dashboard.inventory_overview.categories',
    subproducts: 'dashboard.inventory_overview.sub_products',
    erp: 'dashboard.inventory_overview.total_items_erp',
    scanned: 'dashboard.inventory_overview.items_scanned',
    discrepancies: 'dashboard.inventory_overview.discrepancies',
    stocktakes: 'dashboard.inventory_overview.stocktakes_per_month',
  }

  const visibleMetricCards = metricCards.filter((card) => (
    !metricPermissionByKey[card.key] || hasPermission(metricPermissionByKey[card.key], user)
  ))

  const canSeeStocktakeFindings = hasPermission('dashboard.stock_verification.last_stocktake_findings', user)
  const canSeeStocktakeHistory = hasPermission('dashboard.stock_verification.stocktake_history', user)

  const canSeeProductMix = hasPermission('dashboard.stock_analytics.product_mix', user)
  const canSeeCategoryBreakdown = hasPermission('dashboard.stock_analytics.category_breakdown', user)
  const canSeeAccuracyTrend = hasPermission('dashboard.stock_analytics.accuracy_trend', user)
  const canSeeCounterAccuracy = hasPermission('dashboard.stock_analytics.counter_accuracy', user)
  const canSeeDayWiseSales = hasPermission('dashboard.stock_analytics.day_wise_sales', user)
  const canSeeCounterSplit = hasPermission('dashboard.stock_analytics.counter_split', user)
  const canSeeDailyImports = hasPermission('dashboard.stock_analytics.daily_imports', user)
  const canSeeTopSoldProducts = hasPermission('dashboard.stock_analytics.top_sold_products', user)

  const canSeeSmartAlerts = hasPermission('dashboard.branch.smart_alerts', user)
  const canSeeBranchComparison = hasPermission('dashboard.branch.branch_comparison', user)
  const canSeeStockMovement = hasPermission('dashboard.branch.stock_movement', user)

  const byProduct = summary?.byProduct ?? []
  const byCounter = summary?.byCounter ?? []
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

  if (isLogoutInProgress()) {
    return null
  }

  if (loading) {
    return (
      <div className="dashboard">
        <DashboardSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="dashboard-empty">
          <h2>Could not load dashboard</h2>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  if (!user || !isAuthenticated()) {
    return null
  }

  if (!canViewDashboard) {
    if (isLogoutInProgress()) return null

    return (
      <div className="dashboard">
        <div className="dashboard-empty">
          <h2>Dashboard access denied</h2>
          <p>You don&apos;t have permission to view the dashboard.</p>
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
            <span className="dashboard-rate-card__icon">SP</span>
            <div className="dashboard-rate-card__info">
              <strong>{formatCount(totals.subProducts)}</strong>
              <span>sub-products</span>
            </div>
          </div>
        </div>
      </section>

      {/* Key Metrics */}
      {visibleMetricCards.length > 0 && (
        <section className="dashboard-inventory-overview">
          <div className="module-header">
            <div className="module-header__main">
              <h2>Inventory Overview</h2>
            </div>
          </div>

          <div className="dashboard-metrics">
            {visibleMetricCards.map((card) => (
              <MetricCard key={card.key} {...card} />
            ))}
          </div>
        </section>
      )}

      {/* Stocktake */}
      {(canSeeStocktakeFindings || canSeeStocktakeHistory) && (
        <section className="dashboard-stocktake">
          <div className="module-header">
            <div className="module-header__main">
              <h2>Stock Verification</h2>
            </div>
            {stocktake.stocktakesThisMonth > 0 && (
              <span className="module-header__badge">
                {stocktake.stocktakesThisMonth}
                {' '}
                this month
              </span>
            )}
          </div>

          <div className="stocktake-grid">
            {canSeeStocktakeFindings && <LastStocktakeFindings stocktake={stocktake} />}
            {canSeeStocktakeHistory && <StocktakeHistory stocktake={stocktake} />}
          </div>
        </section>
      )}

      {/* Analytics */}
      {(canSeeProductMix
        || canSeeCategoryBreakdown
        || canSeeAccuracyTrend
        || canSeeCounterAccuracy
        || canSeeDayWiseSales
        || canSeeCounterSplit
        || canSeeDailyImports
        || canSeeTopSoldProducts) && (
        <section className="dashboard-analytics">
          <div className="module-header">
            <div className="module-header__main">
              <h2>Stock Analytics</h2>
            </div>
          </div>

          <div className="analytics-grid">
            {(canSeeProductMix || canSeeCategoryBreakdown) && (
              <div className="category-mix-row">
                {canSeeProductMix && (
                  <AnalyticsTile
                    title="Product mix by category"
                    subtitle="Distribution of inventory across product groups"
                  >
                    <ProductCategoryDonut data={byProduct} totalPieces={totals.totalPieces} />
                  </AnalyticsTile>
                )}

                {canSeeCategoryBreakdown && (
                  <AnalyticsTile
                    title="Category breakdown"
                    subtitle={`${formatCount(totals.totalPieces)} total items across ${formatCount(byProduct.length)} groups`}
                  >
                    <CategoryBreakdownTable data={byProduct} totalPieces={totals.totalPieces} />
                  </AnalyticsTile>
                )}
              </div>
            )}

            {(canSeeAccuracyTrend || canSeeCounterAccuracy) && (
              <div className="accuracy-split-row">
                {canSeeAccuracyTrend && (
                  <AnalyticsTile title="Accuracy trend" subtitle="Last 6 stocktakes">
                    <AccuracyTrendChart stocktake={stocktake} />
                  </AnalyticsTile>
                )}

                {canSeeCounterAccuracy && (
                  <AnalyticsTile title="Counter / display accuracy" subtitle="By physical location in store">
                    <CounterDisplayAccuracyPanel counterAccuracy={counterAccuracy} loading={loading} />
                  </AnalyticsTile>
                )}
              </div>
            )}

            {(canSeeDayWiseSales || canSeeCounterSplit) && (
              <div className="sales-accuracy-row">
                {canSeeDayWiseSales && (
                  <DayWiseSalesCard
                    period={salesPeriod}
                    counter={salesCounter}
                    onPeriodChange={setSalesPeriod}
                    onCounterChange={setSalesCounter}
                    loading={dayWiseLoading}
                    error={dayWiseError}
                    data={dayWiseSales.data}
                    totalSoldPieces={dayWiseSales.totalSoldPieces}
                    branchLabel={dayWiseBranchLabel}
                  />
                )}

                {canSeeCounterSplit && (
                  <AnalyticsTile title="Counter split" subtitle="Tag count in showroom vs safe storage">
                    <CounterSplitChart data={counterSplitData} />
                  </AnalyticsTile>
                )}
              </div>
            )}

            {canSeeDailyImports && (
              <DailyImportsCard
                period={importPeriod}
                counter={importCounter}
                onPeriodChange={setImportPeriod}
                onCounterChange={setImportCounter}
                loading={dailyImportsLoading}
                error={dailyImportsError}
                data={dailyImports.data}
              />
            )}

            {canSeeTopSoldProducts && (
              <AnalyticsTile title="Top Sold Products" subtitle="Overall sold pieces across all stock import batches" wide>
                {topSoldLoading && <p className="analytics-empty">Loading sold products…</p>}
                {!topSoldLoading && topSoldNotice && !topSoldBarData.length && (
                  <p className="analytics-empty">{topSoldNotice}</p>
                )}
                {!topSoldLoading && topSoldBarData.length > 0 && (
                  <ProductBarChart data={topSoldBarData} />
                )}
              </AnalyticsTile>
            )}
          </div>
        </section>
      )}

      <section className="dashboard-insights">
        <div className="insight-section__nav" aria-label="Insight categories">
          <span className="insight-section__nav-item insight-section__nav-item--active">Branch</span>
          <span className="insight-section__nav-item insight-section__nav-item--active">Movement</span>
          <span className={`insight-section__nav-item${(smartAlerts?.alerts?.length ?? 0) > 0 ? ' insight-section__nav-item--active' : ''}`}>
            Compliance
          </span>
        </div>

        {canSeeSmartAlerts && (
          <SmartAlertsCard
            data={smartAlerts}
            loading={smartAlertsLoading}
            error={smartAlertsError}
          />
        )}

        <div className="insight-grid">
          {canSeeBranchComparison && (
            <MultiBranchComparisonCard
              data={branchComparison}
              loading={branchComparisonLoading}
              error={branchComparisonError}
            />
          )}
          {canSeeStockMovement && (
            <StockMovementCard
              data={stockMovement}
              loading={stockMovementLoading}
              error={stockMovementError}
            />
          )}
        </div>
      </section>
    </div>
  )
}
