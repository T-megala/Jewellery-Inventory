import './TablePagination.css'

export const DEFAULT_PAGE_SIZE = 20
export const PAGE_SIZE_OPTIONS = [20, 50, 100]

function buildPageItems(currentPage, totalPages, siblingCount = 1) {
  const total = Math.max(totalPages, 1)
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1)
  }

  const items = []
  const left = Math.max(2, currentPage - siblingCount)
  const right = Math.min(total - 1, currentPage + siblingCount)

  items.push(1)

  if (left > 2) {
    items.push('…')
  }

  for (let page = left; page <= right; page += 1) {
    items.push(page)
  }

  if (right < total - 1) {
    items.push('…')
  }

  items.push(total)
  return items
}

export default function TablePagination({
  page,
  pageSize,
  totalPages = 1,
  totalRecords = 0,
  rowCount = 0,
  onPageChange,
  onPageSizeChange,
  disabled = false,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  className = '',
}) {
  if (!totalRecords && !rowCount) return null

  const safePage = Math.max(1, page)
  const safeTotalPages = Math.max(totalPages, 1)
  const start = totalRecords === 0 ? 0 : (safePage - 1) * pageSize + 1
  const end = totalRecords === 0 ? 0 : start + rowCount - 1
  const pageItems = buildPageItems(safePage, safeTotalPages)

  return (
    <div className={`table-pagination${className ? ` ${className}` : ''}`}>
      <label className="table-pagination__size">
        <span>Rows per page</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          disabled={disabled}
          aria-label="Rows per page"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </label>

      <div className="table-pagination__nav">
        <span className="table-pagination__info">
          {start.toLocaleString('en-IN')}
          –
          {end.toLocaleString('en-IN')}
          {' of '}
          {totalRecords.toLocaleString('en-IN')}
        </span>

        <div className="table-pagination__controls">
          <button
            type="button"
            className="table-pagination__btn table-pagination__btn--prev"
            onClick={() => onPageChange(safePage - 1)}
            disabled={disabled || safePage <= 1}
            aria-label="Previous page"
          >
            <span className="table-pagination__btn-text">Previous</span>
            <span className="table-pagination__btn-icon" aria-hidden="true">‹</span>
          </button>

          <div className="table-pagination__pages" role="group" aria-label="Pagination pages">
            {pageItems.map((item, index) => {
              if (item === '…') {
                return (
                  <span key={`ellipsis-${index}`} className="table-pagination__ellipsis" aria-hidden="true">
                    …
                  </span>
                )
              }

              const isActive = item === safePage
              return (
                <button
                  key={item}
                  type="button"
                  className={`table-pagination__num${isActive ? ' table-pagination__num--active' : ''}`}
                  onClick={() => onPageChange(item)}
                  disabled={disabled || isActive}
                  aria-label={`Page ${item}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {item.toLocaleString('en-IN')}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            className="table-pagination__btn table-pagination__btn--next"
            onClick={() => onPageChange(safePage + 1)}
            disabled={disabled || safePage >= safeTotalPages}
            aria-label="Next page"
          >
            <span className="table-pagination__btn-text">Next</span>
            <span className="table-pagination__btn-icon" aria-hidden="true">›</span>
          </button>
        </div>
      </div>
    </div>
  )
}
