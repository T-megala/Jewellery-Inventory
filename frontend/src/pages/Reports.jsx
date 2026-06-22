import { useMemo, useState } from 'react'
import { fetchStockVerificationReport } from '../services/reports.js'
import TablePagination from '../components/TablePagination.jsx'
import './Reports.css'

const DEFAULT_PAGE_SIZE = 10

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'FULLY_VERIFIED', label: 'Fully Verified' },
  { value: 'PARTIALLY_VERIFIED', label: 'Partially Verified' },
  { value: 'NOT_VERIFIED', label: 'Not Verified' },
]

const STAT_CARDS = [
  { key: 'total', label: 'Total Items', field: 'totalTags', variant: 'total' },
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
  if (status === 'FULLY_VERIFIED') return 'report-status report-status--found'
  if (status === 'PARTIALLY_VERIFIED') return 'report-status report-status--partial'
  if (status === 'NOT_VERIFIED') return 'report-status report-status--missing'
  return 'report-status'
}

function formatStatus(status) {
  if (status === 'FULLY_VERIFIED') return 'Fully Verified'
  if (status === 'PARTIALLY_VERIFIED') return 'Partially Verified'
  if (status === 'NOT_VERIFIED') return 'Not Verified'
  return status || '—'
}

function formatStatValue(summary, field) {
  if (!summary) return '—'
  const value = summary[field]
  return Number(value ?? 0).toLocaleString('en-IN')
}

function formatQty(value) {
  if (value === null || value === undefined || value === '') return '—'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  return numeric.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatCellValue(value) {
  const label = String(value ?? '').trim()
  return label || '—'
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
  const [barcodeSearch, setBarcodeSearch] = useState('')
  const [status, setStatus] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [hasSearched, setHasSearched] = useState(false)

  const [loadingReport, setLoadingReport] = useState(false)
  const [error, setError] = useState('')

  const filterParams = useMemo(() => ({
    search: barcodeSearch.trim() || undefined,
    status: status || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  }), [barcodeSearch, status, fromDate, toDate])

  function validateDates() {
    if (!fromDate && !toDate) {
      return true
    }

    if (!fromDate) {
      setError('From Date is required when To Date is set.')
      return false
    }

    if (!toDate) {
      setError('To Date is required when From Date is set.')
      return false
    }

    if (fromDate > toDate) {
      setError('From Date cannot be later than To Date.')
      return false
    }

    return true
  }

  async function loadReport(nextPage = 1, limit = pageSize) {
    if (!validateDates()) return

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
    setBarcodeSearch('')
    setStatus('')
    setFromDate('')
    setToDate('')
    setRows([])
    setSummary(null)
    setPagination(null)
    setPage(1)
    setPageSize(DEFAULT_PAGE_SIZE)
    setHasSearched(false)
    setError('')
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
              <span>From Date</span>
              <input
                type="date"
                value={fromDate}
                max={toDate || getTodayDate()}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </label>

            <label className="report-field">
              <span>To Date</span>
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                max={getTodayDate()}
                onChange={(e) => setToDate(e.target.value)}
              />
            </label>

            <label className="report-field">
              <span>Barcode</span>
              <input
                type="search"
                value={barcodeSearch}
                placeholder="Search by barcode"
                onChange={(e) => setBarcodeSearch(e.target.value)}
              />
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

          {error && (
            <p className="report-alert report-alert--error" role="alert">{error}</p>
          )}

          <div className="report-filters__actions">
            <button
              type="button"
              className="report-btn report-btn--ghost"
              onClick={handleReset}
              disabled={loadingReport}
            >
              Reset
            </button>
            <button
              type="submit"
              className={`report-btn report-btn--primary${loadingReport ? ' report-btn--loading' : ''}`}
              disabled={loadingReport}
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
                    <col className="reports-table__col-sno" />
                    <col className="reports-table__col-barcode" />
                    <col className="reports-table__col-description" />
                    <col className="reports-table__col-qty" />
                    <col className="reports-table__col-qty" />
                    <col className="reports-table__col-status" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Barcode</th>
                      <th>Item Description</th>
                      <th>Found Qty</th>
                      <th>Missing Qty</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={row.id}>
                        <td className="reports-table__sno">{(page - 1) * pageSize + index + 1}</td>
                        <td className="reports-table__barcode">{formatCellValue(row.barcode)}</td>
                        <td className="reports-table__description">{formatCellValue(row.itemDescription)}</td>
                        <td className="reports-table__qty">{formatQty(row.foundQty)}</td>
                        <td className="reports-table__qty">{formatQty(row.missingQty)}</td>
                        <td className="reports-table__status">
                          <span className={statusBadgeClass(row.status)}>
                            {formatStatus(row.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
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
