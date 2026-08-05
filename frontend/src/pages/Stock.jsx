import { useCallback, useEffect, useMemo, useState } from 'react'
import TablePagination, { DEFAULT_PAGE_SIZE } from '../components/TablePagination.jsx'
import { useBranchScope } from '../hooks/useBranchScope.js'
import { getUser, hasPermission, isAuthenticated, isLogoutInProgress } from '../services/auth.js'
import { fetchCenters, fetchProducts, fetchSubProducts } from '../services/products.js'
import { downloadStockExport, fetchProductList } from '../services/stock.js'
import './Module.css'
import './Stock.css'

const SEARCH_DEBOUNCE_MS = 400

function formatValue(value) {
  if (value === null || value === undefined || value === '') {
    return <span className="stock-cell--empty">—</span>
  }
  return value
}

export default function Stock() {
  const user = getUser()
  const canViewStock = hasPermission('products.view', user)
  const { operationalValue } = useBranchScope()
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [product, setProduct] = useState('')
  const [subProduct, setSubProduct] = useState('')
  const [counter, setCounter] = useState('')
  const [products, setProducts] = useState([])
  const [subProducts, setSubProducts] = useState([])
  const [counters, setCounters] = useState([])
  const [loadingFilters, setLoadingFilters] = useState(true)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  const filterParams = useMemo(
    () => ({
      search: search || undefined,
      productName: product || undefined,
      subProductName: subProduct || undefined,
      centerName: counter || undefined,
    }),
    [search, product, subProduct, counter],
  )

  const hasActiveFilters = Boolean(search || product || subProduct || counter)

  const loadStock = useCallback(async (pageNum, filters = filterParams, limit = pageSize) => {
    setLoading(true)
    setError('')

    try {
      const result = await fetchProductList({
        page: pageNum,
        limit,
        ...filters,
      })
      setRows(result.rows)
      setPagination(result.pagination)
      setPage(pageNum)
    } catch (err) {
      setError(err.message || 'Failed to load stock list.')
      setRows([])
      setPagination(null)
    } finally {
      setLoading(false)
    }
  }, [filterParams, pageSize])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim())
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    if (!canViewStock) return undefined

    let cancelled = false

    async function loadProducts() {
      setLoadingFilters(true)
      try {
        const data = await fetchProducts()
        if (!cancelled) {
          setProducts(data)
          setProduct('')
          setSubProduct('')
          setCounter('')
          setSubProducts([])
          setCounters([])
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load products')
      } finally {
        if (!cancelled) setLoadingFilters(false)
      }
    }

    loadProducts()
    return () => { cancelled = true }
  }, [canViewStock, operationalValue])

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

  useEffect(() => {
    if (!canViewStock) return undefined
    loadStock(1, filterParams)
  }, [canViewStock, loadStock, filterParams, operationalValue])

  function handleClearFilters() {
    setSearchInput('')
    setSearch('')
    setProduct('')
    setSubProduct('')
    setCounter('')
    setSubProducts([])
    setCounters([])
  }

  function handlePageSizeChange(nextSize) {
    setPageSize(nextSize)
    loadStock(1, filterParams, nextSize)
  }

  async function handleExportExcel() {
    setExporting(true)
    setError('')

    try {
      await downloadStockExport(filterParams)
    } catch (err) {
      setError(err.message || 'Failed to export stock to Excel.')
    } finally {
      setExporting(false)
    }
  }

  if (isLogoutInProgress()) {
    return null
  }

  if (!user || !isAuthenticated()) {
    return null
  }

  if (!canViewStock) {
    if (isLogoutInProgress()) return null

    return (
      <div className="stock-page">
        <div className="module-access-denied">
          <h2>Stock access denied</h2>
          <p>You don&apos;t have permission to view stock.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="stock-page">
      <div className="stock-meta">
        <div className="stock-filters">
          <div className="stock-search">
            <div className="stock-search__field">
              <span className="stock-search__icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search product, tag, counter…"
                aria-label="Search stock"
              />
              {searchInput && (
                <button
                  type="button"
                  className="stock-search__clear"
                  onClick={() => setSearchInput('')}
                  aria-label="Clear search"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <label className="stock-filter">
            <span>Product</span>
            <select
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              disabled={loadingFilters}
            >
              <option value="">All Products</option>
              {products.map((item) => (
                <option key={item.id ?? item.name} value={item.name}>{item.name}</option>
              ))}
            </select>
          </label>

          <label className="stock-filter">
            <span>Sub Product</span>
            <select
              value={subProduct}
              onChange={(e) => setSubProduct(e.target.value)}
              disabled={!product}
            >
              <option value="">All Sub Products</option>
              {subProducts.map((item) => (
                <option key={item.id ?? item.name} value={item.name}>{item.name}</option>
              ))}
            </select>
          </label>

          <label className="stock-filter">
            <span>Counter</span>
            <select
              value={counter}
              onChange={(e) => setCounter(e.target.value)}
              disabled={!product || !subProduct}
            >
              <option value="">All Counters</option>
              {counters.map((item) => (
                <option key={item.id ?? item.name} value={item.name}>{item.name}</option>
              ))}
            </select>
          </label>

          {hasActiveFilters && (
            <button
              type="button"
              className="stock-btn"
              onClick={handleClearFilters}
              disabled={loading || exporting}
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="stock-meta__actions">
          {pagination && (
            <span className="stock-meta__badge">
              {pagination.totalRecords.toLocaleString('en-IN')} item{pagination.totalRecords === 1 ? '' : 's'}
            </span>
          )}
          <button
            type="button"
            className={`stock-btn stock-btn--export${exporting ? ' stock-btn--loading' : ''}`}
            onClick={handleExportExcel}
            disabled={exporting || loading || !pagination || pagination.totalRecords === 0}
            title={
              !pagination || pagination.totalRecords === 0
                ? 'No data to export'
                : 'Export stock to Excel'
            }
          >
            {exporting && <span className="stock-btn__spin" aria-hidden="true" />}
            Excel
          </button>
        </div>
      </div>

      <div className="stock-panel">
        {error && (
          <p className="stock-alert stock-alert--error" role="alert">{error}</p>
        )}

        {loading ? (
          <div className="stock-loading" role="status" aria-live="polite" aria-label="Loading stock">
            <div className="stock-loading__spinner" aria-hidden="true">
              <span className="stock-loading__ring" />
            </div>
            <p className="stock-loading__text">Loading stock…</p>
          </div>
        ) : rows.length === 0 ? (
          <p className="stock-empty">
            {hasActiveFilters ? 'No products found for the selected filters.' : 'No stock records found.'}
            {hasActiveFilters && (
              <>
                {' '}
                <button type="button" className="stock-btn" onClick={handleClearFilters}>
                  Clear filters
                </button>
              </>
            )}
          </p>
        ) : (
          <div className="stock-panel__body">
            <div className="stock-table-scroll">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Pro Code</th>
                    <th>Product</th>
                    <th>Tag No</th>
                    <th>Gross Wt</th>
                    <th>Net Wt</th>
                    <th>Less Wt</th>
                    <th>Wastage</th>
                    <th>Making Charge</th>
                    <th>Tran No</th>
                    <th>Tran Date</th>
                    <th>Branch</th>
                    <th>Sub Product</th>
                    <th>Pieces</th>
                    <th>Counter</th>
                    <th>Size</th>
                    <th>Tag Type</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id}>
                      <td className="stock-cell--sno">{(page - 1) * pageSize + index + 1}</td>
                      <td className="stock-cell--num">{formatValue(row.proCode)}</td>
                      <td>{formatValue(row.product)}</td>
                      <td className="stock-cell--tag">{formatValue(row.tagPacketNo ?? row.tagNo)}</td>
                      <td className="stock-cell--num">{formatValue(row.grossWeight ?? row.grossWt)}</td>
                      <td className="stock-cell--num">{formatValue(row.netWeight ?? row.netWt)}</td>
                      <td className="stock-cell--num">{formatValue(row.lessWt)}</td>
                      <td className="stock-cell--num">{formatValue(row.wastagePercentage)}</td>
                      <td className="stock-cell--num">{formatValue(row.makingCharge ?? row.maxMC)}</td>
                      <td>{formatValue(row.tranNo)}</td>
                      <td>{formatValue(row.tranDate)}</td>
                      <td>{formatValue(row.branchName)}</td>
                      <td>{formatValue(row.subProduct)}</td>
                      <td className="stock-cell--num">{formatValue(row.pieces)}</td>
                      <td>{formatValue(row.counterName)}</td>
                      <td>{formatValue(row.size)}</td>
                      <td>{formatValue(row.tagType)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination && (
              <TablePagination
                className="stock-table-pagination"
                page={page}
                pageSize={pageSize}
                totalPages={pagination.totalPages}
                totalRecords={pagination.totalRecords}
                rowCount={rows.length}
                onPageChange={(nextPage) => loadStock(nextPage, filterParams)}
                onPageSizeChange={handlePageSizeChange}
                disabled={loading}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
