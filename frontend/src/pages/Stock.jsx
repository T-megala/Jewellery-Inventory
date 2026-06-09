import { useCallback, useEffect, useState } from 'react'
import { fetchProductList } from '../services/stock.js'
import './Stock.css'

const PAGE_LIMIT = 10
const SEARCH_DEBOUNCE_MS = 400

function formatValue(value) {
  if (value === null || value === undefined || value === '') {
    return <span className="stock-cell--empty">—</span>
  }
  return value
}

export default function Stock() {
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadStock = useCallback(async (pageNum, searchTerm) => {
    setLoading(true)
    setError('')

    try {
      const result = await fetchProductList({
        page: pageNum,
        limit: PAGE_LIMIT,
        search: searchTerm || undefined,
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
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim())
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    loadStock(1, search)
  }, [loadStock, search])

  function handleClearSearch() {
    setSearchInput('')
  }

  return (
    <div className="stock-page">
      <div className="stock-meta">
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
                onClick={handleClearSearch}
                aria-label="Clear search"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {pagination && (
          <span className="stock-meta__badge">
            {pagination.totalRecords.toLocaleString('en-IN')} item{pagination.totalRecords === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="stock-panel">
        <div className="stock-panel__head">
          <h2 className="stock-panel__title">Stock List</h2>
          {pagination && (
            <span className="stock-panel__count">
              Page {pagination.page} of {pagination.totalPages || 1}
              {' · '}
              Showing {rows.length} of {pagination.totalRecords}
            </span>
          )}
        </div>

        {error && (
          <p className="stock-alert stock-alert--error" role="alert">{error}</p>
        )}

        {loading ? (
          <p className="stock-loading">Loading stock…</p>
        ) : rows.length === 0 ? (
          <p className="stock-empty">
            {search ? 'No products found for your search.' : 'No stock records found.'}
            {search && (
              <>
                {' '}
                <button type="button" className="stock-btn" onClick={handleClearSearch}>
                  Clear search
                </button>
              </>
            )}
          </p>
        ) : (
          <>
            <div className="stock-table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Tran No</th>
                    <th>Tran Date</th>
                    <th>Product</th>
                    <th>Sub Product</th>
                    <th>Tag / Packet No</th>
                    <th>Pieces</th>
                    <th>Gross Wt</th>
                    <th>Net Wt</th>
                    <th>Counter</th>
                    <th>Size</th>
                    <th>Tag Type</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id}>
                      <td className="stock-cell--sno">{(page - 1) * PAGE_LIMIT + index + 1}</td>
                      <td>{formatValue(row.tranNo)}</td>
                      <td>{formatValue(row.tranDate)}</td>
                      <td>{formatValue(row.product)}</td>
                      <td>{formatValue(row.subProduct)}</td>
                      <td>{formatValue(row.tagPacketNo)}</td>
                      <td>{formatValue(row.pieces)}</td>
                      <td>{formatValue(row.grossWt)}</td>
                      <td>{formatValue(row.netWt)}</td>
                      <td>{formatValue(row.counterName)}</td>
                      <td>{formatValue(row.size)}</td>
                      <td>{formatValue(row.tagType)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="stock-pagination">
                <button
                  type="button"
                  className="stock-btn"
                  onClick={() => loadStock(page - 1, search)}
                  disabled={loading || page <= 1}
                >
                  Previous
                </button>
                <span className="stock-pagination__info">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  type="button"
                  className="stock-btn"
                  onClick={() => loadStock(page + 1, search)}
                  disabled={loading || page >= pagination.totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
