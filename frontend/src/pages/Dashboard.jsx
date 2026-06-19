import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  EMPTY_COUNTER_ACCURACY,
  EMPTY_STOCKTAKE,
  fetchDailyImports,
  fetchDashboard,
  fetchDayWiseSales,
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

function pct(part, whole) {
  const total = Number(whole)
  if (!total) return '0'
  return ((Number(part) / total) * 100).toFixed(1)
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
  const totalStock = data.reduce((sum, row) => sum + (row.totalStock ?? 0), 0)
  const importCount = data.length

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
            <span className="day-sales-total">
              {formatCount(importCount)}
              {' '}
              imports ·
              {' '}
              <strong>{formatCount(totalStock)}</strong>
              {' '}
              stock
            </span>
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

function CounterDisplayAccuracy({ counterAccuracy, loading }) {
  const locations = counterAccuracy?.locations ?? []
  const hasData = locations.length > 0

  return (
    <article className="counter-accuracy-card">
      <header className="counter-accuracy-card__head">
        <DashboardTitleRow>
          <h3>Counter / display accuracy</h3>
        </DashboardTitleRow>
        <p className="counter-accuracy-card__subtitle">By physical location in store</p>
      </header>

      <div className="counter-accuracy-card__body">
        {loading && <p className="analytics-empty">Loading counter accuracy…</p>}
        {!loading && !hasData && (
          <p className="analytics-empty">Counter accuracy will appear after stock verification.</p>
        )}
        {!loading && hasData && (
          <ul className="counter-accuracy-list">
            {locations.map((row) => {
              const tone = getStocktakeAccuracyTone(row.accuracyPercent)
              const label = row.label || row.name

              return (
                <li key={row.name} className="counter-accuracy-list__row">
                  <span className="counter-accuracy-list__label" title={label}>{label}</span>
                  <span className={`counter-accuracy-list__value dashboard-num counter-accuracy-list__value--${tone}`}>
                    {formatAccuracyPercent(row.accuracyPercent)}
                    %
                  </span>
                </li>
              )
            })}
          </ul>
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
}) {
  return (
    <article className="analytics-tile day-sales-card">
      <header className="day-sales-card__head">
        <DashboardTitleRow>
          <h3 className="day-sales-card__title">Day-wise sales — pieces sold</h3>
        </DashboardTitleRow>
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

function ProductCategoryBreakdown({ data, totalPieces }) {
  const rows = [...(data || [])]
    .map((row) => ({
      name: truncate(row.name, 24),
      fullName: row.name,
      count: Number(row.pieceCount ?? 0),
      tagCount: Number(row.tagCount ?? 0),
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)

  if (!rows.length) return <p className="analytics-empty">No product category data available.</p>

  const max = Math.max(...rows.map((row) => row.count), 1)
  const total = Number(totalPieces) || rows.reduce((sum, row) => sum + row.count, 0)

  return (
    <div className="product-category-breakdown">
      <div className="product-category-breakdown__columns" aria-hidden="true">
        <span>Category</span>
        <span />
        <span>Pieces</span>
        <span>Share</span>
      </div>

      <ul className="product-category-breakdown__list">
        {rows.map((row, index) => {
          const width = Math.max((row.count / max) * 100, row.count > 0 ? 3 : 0)
          return (
            <li key={row.fullName} className="product-category-breakdown__row">
              <span className="product-category-breakdown__name" title={row.fullName}>{row.name}</span>
              <div className="product-category-breakdown__track" aria-hidden="true">
                <span
                  className="product-category-breakdown__fill"
                  style={{
                    width: `${width}%`,
                    background: `linear-gradient(90deg, ${CHART_COLORS[index % CHART_COLORS.length]}, ${CHART_COLORS[(index + 1) % CHART_COLORS.length]})`,
                  }}
                />
              </div>
              <span className="product-category-breakdown__count">{formatCount(row.count)}</span>
              <span className="product-category-breakdown__pct">{pct(row.count, total)}%</span>
            </li>
          )
        })}
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
        <DashboardTitleRow>
          <h3>{title}</h3>
        </DashboardTitleRow>
        <p>{subtitle}</p>
      </header>
      <div className="analytics-tile__body">{children}</div>
    </article>
  )
}

function buildMetricCards(totals, stocktake, batch) {
  const erpTotal = Number(stocktake?.totalExpected ?? 0) > 0
    ? stocktake.totalExpected
    : totals.totalTags
  const scanRate = Number(stocktake?.scanRatePercent ?? 0)
  const discrepancies = Number(stocktake?.discrepancies ?? 0)

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
      value: formatCount(erpTotal),
      hint: batch?.batchDate ? `EOD sync · ${formatStocktakeDate(batch.batchDate)}` : 'EOD sync',
      variant: 'teal',
    },
    {
      key: 'scanned',
      label: 'Items scanned',
      value: formatCount(stocktake?.itemsScanned ?? 0),
      hint: `${formatAccuracyPercent(scanRate)}% scan rate`,
      variant: 'green',
      hintTone: scanRate > 0 ? 'success' : null,
    },
    {
      key: 'discrepancies',
      label: 'Discrepancies',
      value: formatCount(discrepancies),
      hint: 'Review needed',
      variant: 'red',
      hintTone: discrepancies > 0 ? 'danger' : null,
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
      <p className={`dashboard-metric__hint${hintTone ? ` dashboard-metric__hint--${hintTone}` : ''}`}>
        {hintTone && <MetricTrendIcon direction={hintTone === 'success' ? 'up' : 'down'} />}
        {hint}
      </p>
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
  const [summary, setSummary] = useState(null)
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
  const [importPeriod, setImportPeriod] = useState('week')
  const [importCounter, setImportCounter] = useState('ALL')
  const [dailyImports, setDailyImports] = useState({ data: [] })
  const [dailyImportsLoading, setDailyImportsLoading] = useState(true)
  const [dailyImportsError, setDailyImportsError] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      try {
        const { inventory, verification } = await fetchDashboard()

        if (!cancelled) {
          setSummary(inventory)
          setStocktake(verification?.stocktake ?? EMPTY_STOCKTAKE)
          setCounterAccuracy(verification?.counterAccuracy ?? EMPTY_COUNTER_ACCURACY)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load inventory summary.')
          setSummary(null)
          setStocktake(EMPTY_STOCKTAKE)
          setCounterAccuracy(EMPTY_COUNTER_ACCURACY)
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
  }, [])

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
  }, [loading, summary, salesPeriod, salesCounter])

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
  }, [loading, summary, importPeriod, importCounter])

  const totals = summary?.totals ?? {
    totalTags: 0,
    totalPieces: 0,
    totalGrossWt: 0,
    totalNetWt: 0,
    productGroups: 0,
    subProducts: 0,
    counters: 0,
  }

  const batch = summary?.batch
  const metricCards = buildMetricCards(totals, stocktake, batch)
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

  if (loading) {
    return <DashboardSkeleton />
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
      <section className="dashboard-inventory-overview">
        <div className="module-header">
          <div className="module-header__main">
            <h2>Inventory Overview</h2>
          </div>
          <span className="module-header__badge">Live Data</span>
        </div>

        <div className="dashboard-metrics">
          {metricCards.map((card) => (
            <MetricCard key={card.key} {...card} />
          ))}
        </div>
      </section>

      {/* Stocktake */}
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
          <LastStocktakeFindings stocktake={stocktake} />
          <StocktakeHistory stocktake={stocktake} />
        </div>
      </section>

      {/* Analytics */}
      <section className="dashboard-analytics">
        <div className="module-header">
          <div className="module-header__main">
            <h2>Stock Analytics</h2>
          </div>
        </div>

        <div className="analytics-grid">
          <AnalyticsTile
            title="Product Category Breakdown"
            subtitle={`${formatCount(totals.totalPieces)} total pieces across ${formatCount(byProduct.length)} product groups`}
          >
            <ProductCategoryBreakdown data={byProduct} totalPieces={totals.totalPieces} />
          </AnalyticsTile>

          <AnalyticsTile title="Counter split" subtitle="Tag count in showroom vs safe storage">
            <CounterSplitChart data={counterSplitData} />
          </AnalyticsTile>

          <div className="sales-accuracy-row">
            <DayWiseSalesCard
              period={salesPeriod}
              counter={salesCounter}
              onPeriodChange={setSalesPeriod}
              onCounterChange={setSalesCounter}
              loading={dayWiseLoading}
              error={dayWiseError}
              data={dayWiseSales.data}
              totalSoldPieces={dayWiseSales.totalSoldPieces}
            />

            <CounterDisplayAccuracy
              counterAccuracy={counterAccuracy}
              loading={loading}
            />
          </div>

          <DailyImportsCard
            period={importPeriod}
            counter={importCounter}
            onPeriodChange={setImportPeriod}
            onCounterChange={setImportCounter}
            loading={dailyImportsLoading}
            error={dailyImportsError}
            data={dailyImports.data}
          />

          <AnalyticsTile title="Top Sold Products" subtitle="Overall sold pieces across all stock import batches" wide>
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
