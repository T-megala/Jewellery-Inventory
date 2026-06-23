import { useEffect, useMemo, useState } from 'react'
import { fetchCenters, fetchProducts, fetchSubProducts } from '../services/products.js'
import {
  downloadReportExport,
  fetchStockVerificationReport,
} from '../services/reports.js'
import TablePagination from '../components/TablePagination.jsx'
import { useBranchScope } from '../hooks/useBranchScope.js'
import './Reports.css'

const DEFAULT_PAGE_SIZE = 10

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'FOUND', label: 'Found' },
  { value: 'MISSING', label: 'Missing' },
  { value: 'NEW', label: 'New' },
]

const STAT_CARDS = [
  { key: 'total', label: 'Total Tags', field: 'totalTags', variant: 'total' },
  { key: 'found', label: 'Found', field: 'totalFound', variant: 'found' },
  { key: 'missing', label: 'Missing', field: 'totalMissing', variant: 'missing' },
  { key: 'new', label: 'New', field: 'totalNew', variant: 'new' },
]

function StatIcon({ variant }) {
  if (variant === 'found') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 12l2 2 4-4M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (variant === 'missing') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 8v4m0 4h.01M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }
  if (variant === 'new') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h10M4 17h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function statusBadgeClass(status) {
  if (status === 'FOUND') return 'report-status report-status--found'
  if (status === 'MISSING') return 'report-status report-status--missing'
  if (status === 'NEW') return 'report-status report-status--new'
  return 'report-status'
}

function formatStatus(status) {
  if (status === 'FOUND') return 'Found'
  if (status === 'MISSING') return 'Missing'
  if (status === 'NEW') return 'New'
  return status || '—'
}

function formatReportDateCell(value) {
  if (!value) {
    return { dateLine: '—', timeLine: '', title: '' }
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return { dateLine: '—', timeLine: '', title: String(value) }
  }

  return {
    dateLine: date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    timeLine: date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    title: date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  }
}

function formatStatValue(summary, field) {
  if (!summary) return '—'
  const value = summary[field]
  return Number(value ?? 0).toLocaleString('en-IN')
}

function formatPieces(value) {
  if (value === null || value === undefined || value === '') return '—'
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return '—'
  return numeric.toLocaleString('en-IN')
}

const ALL_SCOPE_LABELS = new Set([
  'all products',
  'all sub products',
  'all centers',
])

function formatScopeDisplay(value, rowStatus) {
  const label = String(value ?? '').trim()
  if (!label) return '—'
  if (rowStatus === 'NEW' && ALL_SCOPE_LABELS.has(label.toLowerCase())) {
    return '—'
  }
  return label
}

function ReportLoader() {
  return (
    <div className="report-loader" role="status" aria-live="polite" aria-label="Loading report">
      <div className="report-loader__center">
        <div className="report-loader__spinner" aria-hidden="true">
          <span className="report-loader__ring" />
          <span className="report-loader__gem" />
        </div>
        <p className="report-loader__text">Fetching report data</p>
        <div className="report-loader__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="report-loader__skeleton" aria-hidden="true">
        <div className="report-loader__skeleton-toolbar" />
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="report-loader__skeleton-row"
            style={{ animationDelay: `${index * 0.08}s` }}
          />
        ))}
      </div>
    </div>
  )
}

function getTodayDate() {
  const date = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export default function Reports() {
  const { operationalValue } = useBranchScope()
  const [product, setProduct] = useState('')
  const [subProduct, setSubProduct] = useState('')
  const [counter, setCounter] = useState('')
  const [status, setStatus] = useState('')
  const [selectedDate, setSelectedDate] = useState(getTodayDate())

  const [products, setProducts] = useState([])
  const [subProducts, setSubProducts] = useState([])
  const [counters, setCounters] = useState([])

  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [hasSearched, setHasSearched] = useState(false)

  const [loadingFilters, setLoadingFilters] = useState(true)
  const [loadingReport, setLoadingReport] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [filtersNotice, setFiltersNotice] = useState('')

  const filterParams = useMemo(() => ({
    productName: product || undefined,
    subProductName: subProduct || undefined,
    centerName: counter || undefined,
    status: status || undefined,
    date: selectedDate || undefined,
  }), [product, subProduct, counter, status, selectedDate])

  useEffect(() => {
    let cancelled = false

    async function loadProducts() {
      setLoadingFilters(true)
      setFiltersNotice('')

      try {
        const data = await fetchProducts()
        if (!cancelled) {
          setProducts(data)
          if (!data.length) {
            setFiltersNotice('No active inventory batch found. Upload Excel on the Import page first.')
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load products')
      } finally {
        if (!cancelled) setLoadingFilters(false)
      }
    }

    loadProducts()
    return () => { cancelled = true }
  }, [operationalValue])

  useEffect(() => {
    if (!hasSearched) return undefined

    let cancelled = false

    async function reloadForBranch() {
      await loadReport(1, pageSize)
    }

    reloadForBranch()
    return () => { cancelled = true }
  }, [operationalValue])

  useEffect(() => {
    if (!product) {
      setSubProducts([])
      setSubProduct('')
      setCounters([])
      setCounter('')
      return undefined
    }

    let cancelled = false

    async function loadSubProducts() {
      try {
        const data = await fetchSubProducts(product)
        if (!cancelled) {
          setSubProducts(data)
          setSubProduct('')
          setCounters([])
          setCounter('')
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load sub products')
      }
    }

    loadSubProducts()
    return () => { cancelled = true }
  }, [product])

  useEffect(() => {
    if (!product || !subProduct) {
      setCounters([])
      setCounter('')
      return undefined
    }

    let cancelled = false

    async function loadCounters() {
      try {
        const data = await fetchCenters(product, subProduct)
        if (!cancelled) {
          setCounters(data)
          setCounter('')
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load counters')
      }
    }

    loadCounters()
    return () => { cancelled = true }
  }, [product, subProduct])

  async function loadReport(nextPage = 1, limit = pageSize) {
    setLoadingReport(true)
    setError('')

    try {
      const result = await fetchStockVerificationReport({
        ...filterParams,
        page: nextPage,
        limit,
      })
      setRows(result.rows)
      setSummary(result.summary)
      setPagination(result.pagination)
      setPage(nextPage)
      setHasSearched(true)
    } catch (err) {
      setError(err.message || 'Failed to load report')
    } finally {
      setLoadingReport(false)
    }
  }

  function handlePageSizeChange(nextSize) {
    setPageSize(nextSize)
    loadReport(1, nextSize)
  }

  async function handleGenerate(e) {
    e.preventDefault()
    await loadReport(1)
  }

  function handleReset() {
    setProduct('')
    setSubProduct('')
    setCounter('')
    setStatus('')
    setSelectedDate(getTodayDate())
    setRows([])
    setSummary(null)
    setPagination(null)
    setPage(1)
    setPageSize(DEFAULT_PAGE_SIZE)
    setHasSearched(false)
    setError('')
  }

  async function handleExport(exportType, label) {
    if (!hasSearched) return

    setExporting(true)
    setError('')

    try {
      await downloadReportExport(filterParams, exportType)
    } catch (err) {
      setError(err.message || `Failed to export ${label}`)
    } finally {
      setExporting(false)
    }
  }

  async function handleExportExcel() {
    await handleExport('excel', 'Excel')
  }

  return (
    <div className="reports-page">
      <div className="reports-stats">
        {STAT_CARDS.map((card) => (
          <article
            key={card.key}
            className={`reports-stat reports-stat--${card.variant}${summary ? '' : ' reports-stat--idle'}`}
          >
            <div className="reports-stat__icon">
              <StatIcon variant={card.variant} />
            </div>
            <div className="reports-stat__body">
              <p className="reports-stat__label">{card.label}</p>
              <strong className="reports-stat__value">
                {formatStatValue(summary, card.field)}
              </strong>
            </div>
          </article>
        ))}
      </div>

      <section className="reports-filters-card">
        <form className="report-filters" onSubmit={handleGenerate}>
          <div className="report-filters__grid">
            <label className="report-field">
              <span>Date</span>
              <input
                type="date"
                value={selectedDate}
                max={getTodayDate()}
                onChange={(e) => setSelectedDate(e.target.value)}
                disabled={loadingFilters}
              />
            </label>

            <label className="report-field">
              <span>Product</span>
              <select
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                disabled={loadingFilters}
              >
                <option value="">All Products</option>
                {products.map((item) => (
                  <option key={item.id} value={item.name}>{item.name}</option>
                ))}
              </select>
            </label>

            <label className="report-field">
              <span>Sub Product</span>
              <select
                value={subProduct}
                onChange={(e) => setSubProduct(e.target.value)}
                disabled={!product}
              >
                <option value="">All Sub Products</option>
                {subProducts.map((item) => (
                  <option key={item.id} value={item.name}>{item.name}</option>
                ))}
              </select>
            </label>

            <label className="report-field">
              <span>Counter</span>
              <select
                value={counter}
                onChange={(e) => setCounter(e.target.value)}
                disabled={!product || !subProduct}
              >
                <option value="">All Counters</option>
                {counters.map((item) => (
                  <option key={item.id} value={item.name}>{item.name}</option>
                ))}
              </select>
            </label>

            <label className="report-field">
              <span>Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((item) => (
                  <option key={item.value || 'all'} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>

          </div>

          {filtersNotice && (
            <p className="report-alert report-alert--info" role="status">{filtersNotice}</p>
          )}

          {error && (
            <p className="report-alert report-alert--error" role="alert">{error}</p>
          )}

          <div className="report-filters__actions">
            <button
              type="button"
              className="report-btn report-btn--ghost"
              onClick={handleReset}
              disabled={loadingReport || exporting}
            >
              Reset
            </button>
            <button
              type="submit"
              className={`report-btn report-btn--primary${loadingReport ? ' report-btn--loading' : ''}`}
              disabled={loadingReport || loadingFilters || exporting}
            >
              {loadingReport && <span className="report-btn__spin" aria-hidden="true" />}
              Generate Report
            </button>
          </div>
        </form>
      </section>

      {(hasSearched || loadingReport) && (
        <section className="reports-results-card">
          <div className="reports-results__head">
            <h3 className="reports-results__title">Results</h3>
            <div className="reports-export">
              <button
                type="button"
                className={`report-btn report-btn--export${exporting ? ' report-btn--loading' : ''}`}
                onClick={handleExportExcel}
                disabled={exporting || loadingReport}
              >
                {exporting && <span className="report-btn__spin report-btn__spin--export" aria-hidden="true" />}
                Excel
              </button>
            </div>
          </div>

          {loadingReport ? (
            <ReportLoader />
          ) : rows.length === 0 ? (
            <p className="report-empty">No records found for the selected filters.</p>
          ) : (
            <div className="reports-results__body">
              <div className="reports-table-scroll">
                <table className="reports-table">
                  <colgroup>
                    <col className="reports-col reports-col--sno" />
                    <col className="reports-col reports-col--date" />
                    <col className="reports-col reports-col--branch" />
                    <col className="reports-col reports-col--product" />
                    <col className="reports-col reports-col--subproduct" />
                    <col className="reports-col reports-col--counter" />
                    <col className="reports-col reports-col--tag" />
                    <col className="reports-col reports-col--pieces" />
                    <col className="reports-col reports-col--status" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Date</th>
                      <th>Branch</th>
                      <th>Product</th>
                      <th>Sub Product</th>
                      <th>Counter</th>
                      <th>Tag No</th>
                      <th>Pieces</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => {
                      const dateCell = formatReportDateCell(row.verificationDate)
                      return (
                      <tr key={row.id}>
                        <td className="reports-table__sno">{(page - 1) * pageSize + index + 1}</td>
                        <td className="reports-table__date" title={dateCell.title}>
                          <span className="reports-table__date-line">{dateCell.dateLine}</span>
                          {dateCell.timeLine && (
                            <span className="reports-table__date-time">{dateCell.timeLine}</span>
                          )}
                        </td>
                        <td>{row.branch?.name || '—'}</td>
                        <td className="reports-table__product" title={row.product || undefined}>
                          {formatScopeDisplay(row.product, row.status)}
                        </td>
                        <td className="reports-table__subproduct" title={row.subProduct || undefined}>
                          {formatScopeDisplay(row.subProduct, row.status)}
                        </td>
                        <td className="reports-table__counter" title={row.counter || undefined}>
                          {formatScopeDisplay(row.counter, row.status)}
                        </td>
                        <td className="reports-table__tag" title={row.tagNo || undefined}>{row.tagNo}</td>
                        <td className="reports-table__pieces">{formatPieces(row.pieces)}</td>
                        <td>
                          <span className={statusBadgeClass(row.status)}>
                            {formatStatus(row.status)}
                          </span>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {pagination && (
                <TablePagination
                  className="reports-table-pagination"
                  page={page}
                  pageSize={pageSize}
                  totalPages={pagination.totalPages}
                  totalRecords={pagination.totalRecords}
                  rowCount={rows.length}
                  onPageChange={(nextPage) => loadReport(nextPage)}
                  onPageSizeChange={handlePageSizeChange}
                  disabled={loadingReport}
                />
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
