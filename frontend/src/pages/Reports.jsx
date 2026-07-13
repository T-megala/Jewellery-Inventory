import { useEffect, useMemo, useState } from 'react'
import {
  fetchCentersForSelection,
  fetchProducts,
  fetchSubProductsForProducts,
} from '../services/products.js'
import ReportMultiSelect from '../components/ReportMultiSelect.jsx'
import {
  clearTodayVerifications,
  downloadReportExport,
  fetchStockVerificationReport,
} from '../services/reports.js'
import TablePagination, { DEFAULT_PAGE_SIZE } from '../components/TablePagination.jsx'
import DeleteConfirmModal from '../components/DeleteConfirmModal.jsx'
import { useBranchScope } from '../hooks/useBranchScope.js'
import { getUser, hasPermission, isAuthenticated, isLogoutInProgress } from '../services/auth.js'
import './Module.css'
import './Reports.css'

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'FOUND', label: 'Found' },
  { value: 'MISSING', label: 'Missing' },
  { value: 'NEW', label: 'New' },
]

const STAT_CARDS = [
  { key: 'total', label: 'Total Stock', field: 'totalStockCount', variant: 'total' },
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

function pruneSelection(selectedNames, options) {
  const available = new Set((options || []).map((item) => item.name))
  return (selectedNames || []).filter((name) => available.has(name))
}

export default function Reports() {
  const user = getUser()
  const canViewReports = hasPermission('stock_verification.report', user)
  const canExportReports = hasPermission('stock_verification.export', user)
  const canClearTodayVerifications = hasPermission('stock_verification.upload', user)
  const { operationalValue, sessionBranches } = useBranchScope()
  const hasNoBranches = sessionBranches.length === 0
  const [selectedProducts, setSelectedProducts] = useState([])
  const [selectedSubProducts, setSelectedSubProducts] = useState([])
  const [selectedCounters, setSelectedCounters] = useState([])
  const [selectedStatuses, setSelectedStatuses] = useState([])
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
  const [loadingSubProducts, setLoadingSubProducts] = useState(false)
  const [loadingCounters, setLoadingCounters] = useState(false)
  const [loadingReport, setLoadingReport] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearModalOpen, setClearModalOpen] = useState(false)
  const [clearNotice, setClearNotice] = useState('')
  const [error, setError] = useState('')
  const [filtersNotice, setFiltersNotice] = useState('')
  const [lastGeneratedKey, setLastGeneratedKey] = useState('')

  const isBranchBlocked = hasNoBranches || /branch is not assigned/i.test(error)
  const isTodaySelected = selectedDate === getTodayDate()
  const filtersLocked = loadingFilters || loadingReport || exporting || clearing

  const statusValues = useMemo(() => {
    const normalized = (selectedStatuses || [])
      .map((value) => String(value).trim().toUpperCase())
      .filter(Boolean)
    // Ignore the "All Statuses" option (empty value)
    return normalized.filter((value) => value !== 'ALL STATUSES')
  }, [selectedStatuses])

  const filterParams = useMemo(() => ({
    productNames: selectedProducts,
    subProductNames: selectedSubProducts,
    centerNames: selectedCounters,
    statuses: statusValues,
    date: selectedDate || undefined,
  }), [selectedProducts, selectedSubProducts, selectedCounters, statusValues, selectedDate])

  const currentFiltersKey = useMemo(() => JSON.stringify({
    productNames: [...(filterParams.productNames || [])].sort(),
    subProductNames: [...(filterParams.subProductNames || [])].sort(),
    centerNames: [...(filterParams.centerNames || [])].sort(),
    status: statusValues.slice().sort(),
    date: filterParams.date || '',
    branch: operationalValue || '',
  }), [filterParams, operationalValue, statusValues])

  const canGenerate = !hasSearched || currentFiltersKey !== lastGeneratedKey

  useEffect(() => {
    if (!canViewReports) return undefined

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
  }, [canViewReports, operationalValue])

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
    if (!selectedProducts.length) {
      setSubProducts([])
      setSelectedSubProducts([])
      setCounters([])
      setSelectedCounters([])
      return undefined
    }

    let cancelled = false

    async function loadSubProducts() {
      setLoadingSubProducts(true)
      try {
        const data = await fetchSubProductsForProducts(selectedProducts)
        if (!cancelled) {
          setSubProducts(data)
          setSelectedSubProducts((prev) => pruneSelection(prev, data))
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load sub products')
      } finally {
        if (!cancelled) setLoadingSubProducts(false)
      }
    }

    loadSubProducts()
    return () => { cancelled = true }
  }, [selectedProducts])

  useEffect(() => {
    if (!selectedProducts.length) {
      setCounters([])
      setSelectedCounters([])
      return undefined
    }

    const subProductNames = selectedSubProducts.length
      ? selectedSubProducts
      : subProducts.map((item) => item.name)

    if (!subProductNames.length) {
      setCounters([])
      setSelectedCounters([])
      return undefined
    }

    let cancelled = false

    async function loadCounters() {
      setLoadingCounters(true)
      try {
        const data = await fetchCentersForSelection(selectedProducts, subProductNames)
        if (!cancelled) {
          setCounters(data)
          setSelectedCounters((prev) => pruneSelection(prev, data))
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load counters')
      } finally {
        if (!cancelled) setLoadingCounters(false)
      }
    }

    loadCounters()
    return () => { cancelled = true }
  }, [selectedProducts, selectedSubProducts, subProducts])

  function clearReportResults() {
    setRows([])
    setSummary(null)
    setPagination(null)
    setPage(1)
  }

  async function loadReport(nextPage = 1, limit = pageSize) {
    setLoadingReport(true)
    setError('')
    setClearNotice('')

    // Prevent stale results being shown if the request fails.
    if (nextPage === 1) {
      clearReportResults()
    }

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
      if (nextPage === 1) {
        setLastGeneratedKey(currentFiltersKey)
      }
    } catch (err) {
      setError(err.message || 'Failed to load report')
      clearReportResults()
      setHasSearched(true)
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
    setSelectedProducts([])
    setSelectedSubProducts([])
    setSelectedCounters([])
    setSelectedStatuses([])
    setSelectedDate(getTodayDate())
    setRows([])
    setSummary(null)
    setPagination(null)
    setPage(1)
    setPageSize(DEFAULT_PAGE_SIZE)
    setHasSearched(false)
    setError('')
    setClearNotice('')
    setLastGeneratedKey('')
  }

  async function handleClearTodayConfirm() {
    setClearing(true)
    setError('')
    setClearNotice('')

    try {
      const result = await clearTodayVerifications(selectedDate)
      setClearModalOpen(false)
      setRows([])
      setSummary(null)
      setPagination(null)
      setPage(1)
      setHasSearched(false)
      setClearNotice(result.message || "Today's verifications cleared successfully")
    } catch (err) {
      setError(err.message || "Failed to clear today's verifications")
    } finally {
      setClearing(false)
    }
  }

  async function handleExport(exportType, label) {
    if (!hasSearched || rows.length === 0) return

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

  if (isLogoutInProgress()) {
    return null
  }

  if (!user || !isAuthenticated()) {
    return null
  }

  if (!canViewReports) {
    if (isLogoutInProgress()) return null

    return (
      <div className="reports-page">
        <div className="module-access-denied">
          <h2>Reports access denied</h2>
          <p>You don&apos;t have permission to view stock verification reports.</p>
        </div>
      </div>
    )
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
                disabled={filtersLocked}
              />
            </label>

            <div className="report-field">
              <span>Product</span>
              <ReportMultiSelect
                options={products}
                selectedNames={selectedProducts}
                onChange={setSelectedProducts}
                disabled={filtersLocked}
                emptyLabel="All Products"
                itemLabel="products"
                searchPlaceholder="Search products…"
              />
            </div>

            <div className="report-field">
              <span>Sub Product</span>
              <ReportMultiSelect
                options={subProducts}
                selectedNames={selectedSubProducts}
                onChange={setSelectedSubProducts}
                disabled={filtersLocked || loadingSubProducts || !selectedProducts.length}
                emptyLabel="All Sub Products"
                itemLabel="sub products"
                searchPlaceholder="Search sub products…"
              />
            </div>

            <div className="report-field">
              <span>Counter</span>
              <ReportMultiSelect
                options={counters}
                selectedNames={selectedCounters}
                onChange={setSelectedCounters}
                disabled={
                  filtersLocked
                  || loadingSubProducts
                  || loadingCounters
                  || !selectedProducts.length
                }
                emptyLabel="All Counters"
                itemLabel="counters"
                searchPlaceholder="Search counters…"
              />
            </div>

            <label className="report-field">
              <span>Status</span>
              <ReportMultiSelect
                options={STATUS_OPTIONS.filter((item) => item.value).map((item) => ({ name: item.label, id: item.value }))}
                selectedNames={selectedStatuses}
                onChange={setSelectedStatuses}
                disabled={filtersLocked}
                emptyLabel="All Statuses"
                itemLabel="statuses"
                searchPlaceholder="Search statuses…"
              />
            </label>

          </div>

          {filtersNotice && (
            <p className="report-alert report-alert--info" role="status">{filtersNotice}</p>
          )}

          {clearNotice && (
            <p className="report-alert report-alert--success" role="status">{clearNotice}</p>
          )}

          {error && (
            <p className="report-alert report-alert--error" role="alert">{error}</p>
          )}

          <div className="report-filters__actions">
            {canClearTodayVerifications && (
              <button
                type="button"
                className={`report-btn report-btn--danger${clearing ? ' report-btn--loading' : ''}`}
                onClick={() => setClearModalOpen(true)}
                disabled={
                  clearing
                  || loadingReport
                  || exporting
                  || loadingFilters
                  || isBranchBlocked
                  || !isTodaySelected
                }
                title={!isTodaySelected ? "Only today's verifications can be cleared" : undefined}
              >
                {clearing && <span className="report-btn__spin" aria-hidden="true" />}
                Clear Today
              </button>
            )}
            <button
              type="button"
              className="report-btn report-btn--ghost"
              onClick={handleReset}
              disabled={loadingReport || exporting || clearing || isBranchBlocked}
            >
              Reset
            </button>
            <button
              type="submit"
              className={`report-btn report-btn--primary${loadingReport ? ' report-btn--loading' : ''}`}
              disabled={
                loadingReport
                || loadingFilters
                || exporting
                || clearing
                || isBranchBlocked
                || !canGenerate
              }
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
            {canExportReports && (
              <div className="reports-export">
                <button
                  type="button"
                  className={`report-btn report-btn--export${exporting ? ' report-btn--loading' : ''}`}
                  onClick={handleExportExcel}
                  disabled={exporting || loadingReport || rows.length === 0}
                  title={
                    rows.length === 0
                        ? 'No data to export'
                        : undefined
                  }
                >
                  {exporting && <span className="report-btn__spin report-btn__spin--export" aria-hidden="true" />}
                  Excel
                </button>
              </div>
            )}
          </div>

          {loadingReport ? (
            <ReportLoader />
          ) : error ? (
            <p className="report-empty" role="alert">
              {error || 'Unable to load report data. Please try again.'}
            </p>
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
                        <tr key={`${row.id ?? row.tagNo}-${index}`}>
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
                  onPageChange={(nextPage) => loadReport(nextPage, pageSize)}
                  onPageSizeChange={handlePageSizeChange}
                  disabled={loadingReport}
                />
              )}
            </div>
          )}
        </section>
      )}

      <DeleteConfirmModal
        open={clearModalOpen}
        title="Clear today's verifications"
        message={(
          <>
            This will permanently delete all stock verification scans for today in the
            selected branch, including found and new tag records. This action cannot be undone.
          </>
        )}
        confirmLabel="Clear Today"
        loading={clearing}
        onConfirm={handleClearTodayConfirm}
        onCancel={() => {
          if (!clearing) setClearModalOpen(false)
        }}
      />
    </div>
  )
}
