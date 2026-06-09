import { useEffect, useMemo, useState } from 'react'
import { fetchCenters, fetchProducts, fetchSubProducts } from '../services/products.js'
import {
  fetchAllStockVerificationReport,
  fetchStockVerificationReport,
} from '../services/reports.js'
import { exportReportToExcel, exportReportToPdf } from '../utils/exportReport.js'
import './Reports.css'

const PAGE_LIMIT = 20

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'FOUND', label: 'Found' },
  { value: 'MISSING', label: 'Missing' },
  { value: 'NEW', label: 'New' },
]

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

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function Reports() {
  const [product, setProduct] = useState('')
  const [subProduct, setSubProduct] = useState('')
  const [counter, setCounter] = useState('')
  const [status, setStatus] = useState('')

  const [products, setProducts] = useState([])
  const [subProducts, setSubProducts] = useState([])
  const [counters, setCounters] = useState([])

  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [hasSearched, setHasSearched] = useState(false)

  const [loadingFilters, setLoadingFilters] = useState(true)
  const [loadingReport, setLoadingReport] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  const filterParams = useMemo(() => ({
    productName: product || undefined,
    subProductName: subProduct || undefined,
    centerName: counter || undefined,
    status: status || undefined,
  }), [product, subProduct, counter, status])

  useEffect(() => {
    let cancelled = false

    async function loadProducts() {
      setLoadingFilters(true)
      try {
        const data = await fetchProducts()
        if (!cancelled) setProducts(data)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load products')
      } finally {
        if (!cancelled) setLoadingFilters(false)
      }
    }

    loadProducts()
    return () => { cancelled = true }
  }, [])

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

  const stats = useMemo(() => {
    if (!summary) {
      return [
        { label: 'Total Tags', value: '—', hint: 'Run report to view' },
        { label: 'Found', value: '—', hint: 'Run report to view' },
        { label: 'Missing', value: '—', hint: 'Run report to view' },
        { label: 'New', value: '—', hint: 'Run report to view' },
      ]
    }

    return [
      {
        label: 'Total Tags',
        value: String(summary.totalTags),
        hint: 'Matching filters',
      },
      {
        label: 'Found',
        value: String(summary.totalFound),
        hint: 'Tags verified in stock',
      },
      {
        label: 'Missing',
        value: String(summary.totalMissing),
        hint: 'Expected but not scanned',
      },
      {
        label: 'New',
        value: String(summary.totalNew),
        hint: 'Scanned but not expected',
      },
    ]
  }, [summary])

  async function loadReport(nextPage = 1) {
    setLoadingReport(true)
    setError('')

    try {
      const result = await fetchStockVerificationReport({
        ...filterParams,
        page: nextPage,
        limit: PAGE_LIMIT,
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

  async function handleGenerate(e) {
    e.preventDefault()
    await loadReport(1)
  }

  function handleReset() {
    setProduct('')
    setSubProduct('')
    setCounter('')
    setStatus('')
    setRows([])
    setSummary(null)
    setPagination(null)
    setPage(1)
    setHasSearched(false)
    setError('')
  }

  const activeFilters = useMemo(() => ({
    product: product || undefined,
    subProduct: subProduct || undefined,
    counter: counter || undefined,
    status: status || undefined,
  }), [product, subProduct, counter, status])

  async function fetchExportRows() {
    const result = await fetchAllStockVerificationReport({
      ...filterParams,
      limit: pagination?.totalRecords || 10000,
    })
    return result.rows
  }

  async function handleExportExcel() {
    if (!rows.length) return
    setExporting(true)
    try {
      const exportRows = await fetchExportRows()
      exportReportToExcel(exportRows)
    } catch (err) {
      setError(err.message || 'Failed to export Excel')
    } finally {
      setExporting(false)
    }
  }

  async function handleExportPdf() {
    if (!rows.length) return
    setExporting(true)
    try {
      const exportRows = await fetchExportRows()
      exportReportToPdf(exportRows, activeFilters, summary)
    } catch (err) {
      setError(err.message || 'Failed to export PDF')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="reports-page">
      {summary && (
        <div className="reports-meta">
          <span className="reports-meta__badge">
            {summary.totalTags} tag{summary.totalTags === 1 ? '' : 's'}
          </span>
        </div>
      )}

      <div className="reports-stats">
        {stats.map((stat) => (
          <div key={stat.label} className="reports-stat">
            <p className="reports-stat__label">{stat.label}</p>
            <strong className="reports-stat__value">{stat.value}</strong>
            <span className="reports-stat__hint">{stat.hint}</span>
          </div>
        ))}
      </div>

      <div className="reports-panel">
        <div className="reports-panel__head">
          <h2 className="reports-panel__title">Filters</h2>
          <p className="reports-panel__desc">Product, sub product, counter and status</p>
        </div>
        <div className="reports-panel__body">
          <form className="report-filters" onSubmit={handleGenerate}>
            <div className="report-filters__grid">
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
                className="report-btn report-btn--primary"
                disabled={loadingReport || loadingFilters || exporting}
              >
                {loadingReport ? 'Generating…' : 'Generate Report'}
              </button>
            </div>
          </form>

          {hasSearched && (
            <div className="reports-results">
              <div className="reports-results__head">
                <div className="reports-results__title-wrap">
                  <h3 className="reports-panel__title">Results</h3>
                  {pagination && (
                    <span className="reports-results__count">
                      Page {pagination.page} of {pagination.totalPages}
                      {' · '}
                      {pagination.totalRecords} records
                    </span>
                  )}
                </div>
                {rows.length > 0 && (
                  <div className="reports-export">
                    <button
                      type="button"
                      className="report-btn report-btn--export"
                      onClick={handleExportExcel}
                      disabled={exporting}
                    >
                      {exporting ? 'Exporting…' : 'Excel'}
                    </button>
                    <button
                      type="button"
                      className="report-btn report-btn--export"
                      onClick={handleExportPdf}
                      disabled={exporting}
                    >
                      {exporting ? 'Exporting…' : 'PDF'}
                    </button>
                  </div>
                )}
              </div>
              <div className="reports-table-wrap">
              {rows.length === 0 ? (
                <p className="report-empty">No verification records found for the selected filters.</p>
              ) : (
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Product</th>
                      <th>Sub Product</th>
                      <th>Counter</th>
                      <th>Tag No</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>{formatDate(row.verificationDate)}</td>
                        <td>{row.product}</td>
                        <td>{row.subProduct}</td>
                        <td>{row.counter}</td>
                        <td>{row.tagNo}</td>
                        <td>
                          <span className={statusBadgeClass(row.status)}>
                            {formatStatus(row.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              </div>

              {pagination && pagination.totalPages > 1 && (
                <div className="reports-pagination">
                  <button
                    type="button"
                    className="report-btn report-btn--ghost"
                    onClick={() => loadReport(page - 1)}
                    disabled={loadingReport || page <= 1}
                  >
                    Previous
                  </button>
                  <span className="reports-pagination__info">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <button
                    type="button"
                    className="report-btn report-btn--ghost"
                    onClick={() => loadReport(page + 1)}
                    disabled={loadingReport || page >= pagination.totalPages}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
