import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  Bar,
  BarChart,
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
  fetchDailyImports,
  fetchDashboard,
  fetchDayWiseSales,
  fetchTopSoldProducts,
} from '../services/dashboard.js'
import './Module.css'
import './Dashboard.css'

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

function truncate(text, max = 18) {
  const str = String(text || '')
  return str.length > max ? `${str.slice(0, max)}…` : str
}

function pct(part, whole) {
  const total = Number(whole)
  if (!total) return '0'
  return ((Number(part) / total) * 100).toFixed(1)
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

function TrendLineDot({ cx, cy, payload, dotOnImportOnly = false }) {
  if (cx == null || cy == null || !payload) return null
  if (dotOnImportOnly && !payload.hasImport) return null
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
  dotOnImportOnly = false,
}) {
  const isMonth = period === 'month'
  const xLabelKey = isMonth ? 'dayMedium' : 'dayShort'
  const showLabels = showValueLabels ?? !isMonth
  const xTickInterval = isMonth ? Math.max(0, Math.floor(chartData.length / 6) - 1) : 0
  const gradientId = `trend-fill-${dataKey}`

  return (
    <div className="trend-line-chart">
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={chartData}
          margin={{ top: 36, right: isMonth ? 16 : 28, left: 8, bottom: isMonth ? 28 : 14 }}
        >
          {showArea && (
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d4af37" stopOpacity={0.16} />
                <stop offset="100%" stopColor="#d4af37" stopOpacity={0} />
              </linearGradient>
            </defs>
          )}
          <XAxis
            dataKey={xLabelKey}
            tick={(props) => <TrendLineXTick {...props} chartData={chartData} labelKey={xLabelKey} />}
            axisLine={false}
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
              type="monotone"
              dataKey={dataKey}
              fill={`url(#${gradientId})`}
              stroke="none"
              isAnimationActive={false}
            />
          )}
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke="#c9a227"
            strokeWidth={2}
            dot={<TrendLineDot dotOnImportOnly={dotOnImportOnly} />}
            activeDot={{ r: 8, stroke: '#fff', strokeWidth: 2.5, fill: '#b8860b' }}
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

function DayWiseSalesBarChart({ data }) {
  const chartData = buildWeekChartRows(data)
  const hasSales = chartData.some((row) => row.soldPieces > 0)

  if (!hasSales) return <p className="analytics-empty">No sales data for this period.</p>

  return (
    <div className="day-sales-bar-chart">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 28, right: 8, left: 0, bottom: 8 }}>
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
            width={44}
          />
          <Tooltip content={<DaySalesTooltip />} cursor={{ fill: 'rgba(184, 134, 11, 0.08)' }} />
          <Bar dataKey="soldPieces" radius={[10, 10, 0, 0]} maxBarSize={48}>
            {chartData.map((entry) => (
              <Cell key={entry.date} fill={DAY_SALES_BAR_COLORS[entry.dayType]} />
            ))}
            <LabelList
              dataKey="soldPieces"
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
          Sold (pieces)
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

function buildDailyImportMonthRows(apiData) {
  return buildDailyImportDayRows(apiData, 30)
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

function DailyImportsLineChart({ data, period }) {
  const chartData = period === 'month'
    ? buildDailyImportMonthRows(data)
    : buildDailyImportWeekRows(data)
  const hasImports = (data || []).length > 0

  if (!hasImports) {
    return <p className="analytics-empty">No import data for this period.</p>
  }

  return (
    <JewelleryTrendLineChart
      chartData={chartData}
      period={period}
      dataKey="totalStock"
      tooltip={DailyImportTooltip}
      legendPrimaryLabel="Stock per batch"
      dotOnImportOnly
    />
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
        <div className="day-sales-card__title-wrap">
          <h3>Daily imports — stock per batch</h3>
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
      </header>

      <div className="analytics-tile__body day-sales-card__body">
        {loading && <p className="analytics-empty">Loading daily imports…</p>}
        {!loading && error && <p className="analytics-empty">{error}</p>}
        {!loading && !error && <DailyImportsLineChart data={data} period={period} />}
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
    <article className="analytics-tile analytics-tile--wide day-sales-card">
      <header className="day-sales-card__head">
        <div className="day-sales-card__title-wrap">
          <h3>Day-wise sales — pieces sold</h3>
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
      </header>

      <div className="analytics-tile__body day-sales-card__body">
        {loading && <p className="analytics-empty">Loading day-wise sales…</p>}
        {!loading && error && <p className="analytics-empty">{error}</p>}
        {!loading && !error && period === 'week' && <DayWiseSalesBarChart data={data} />}
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
      <div className="skeleton-stats" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton-stat">
            <div className="skeleton-stat__top">
              <span className="skeleton skeleton-stat__icon" />
              <span className="skeleton skeleton-stat__label" />
            </div>
            <span className="skeleton skeleton-stat__value" />
            <span className="skeleton skeleton-stat__hint" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null)
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

  const stats = buildStats(totals)
  const byProduct = summary?.byProduct ?? []
  const byCounter = summary?.byCounter ?? []
  const batch = summary?.batch
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
          <AnalyticsTile
            title="Product Category Breakdown"
            subtitle={`${formatCount(totals.totalPieces)} total pieces across ${formatCount(byProduct.length)} product groups`}
          >
            <ProductCategoryBreakdown data={byProduct} totalPieces={totals.totalPieces} />
          </AnalyticsTile>

          <AnalyticsTile title="Counter split" subtitle="Tag count in showroom vs safe storage">
            <CounterSplitChart data={counterSplitData} />
          </AnalyticsTile>

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

          <DailyImportsCard
            period={importPeriod}
            counter={importCounter}
            onPeriodChange={setImportPeriod}
            onCounterChange={setImportCounter}
            loading={dailyImportsLoading}
            error={dailyImportsError}
            data={dailyImports.data}
          />

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
