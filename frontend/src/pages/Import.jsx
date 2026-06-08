import { useEffect, useMemo, useRef, useState } from 'react'
import { getUser } from '../services/auth.js'
import {
  clearTodayImports,
  formatCurrency,
  getImportSummary,
  getTodayImports,
  saveDailyImport,
  setTodayImports,
} from '../services/stockImport.js'
import { downloadStockTemplate, parseStockExcel } from '../utils/parseStockExcel.js'
import './Module.css'
import './Import.css'

function categoryBadge(cat) {
  const key = cat.toLowerCase()
  if (key === 'gold') return 'badge badge--gold'
  if (key === 'silver') return 'badge badge--silver'
  return 'badge badge--diamond'
}

function formatTodayLabel() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const ACCEPTED_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]

export default function Import() {
  const user = getUser()
  const fileInputRef = useRef(null)
  const [items, setItems] = useState([])
  const [savedAt, setSavedAt] = useState(null)
  const [fileName, setFileName] = useState(null)
  const [uploadedAt, setUploadedAt] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const summary = useMemo(() => getImportSummary(items), [items])
  const isSuperAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  useEffect(() => {
    const data = getTodayImports()
    setItems(data.items)
    setSavedAt(data.savedAt)
    setFileName(data.fileName)
    setUploadedAt(data.uploadedAt)
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  async function processFile(file) {
    if (!file) return

    const isExcel = ACCEPTED_TYPES.includes(file.type)
      || file.name.endsWith('.xlsx')
      || file.name.endsWith('.xls')

    if (!isExcel) {
      setError('Please upload an Excel file (.xlsx or .xls).')
      return
    }

    setError('')
    setIsUploading(true)

    try {
      const { items: parsedItems, skipped } = await parseStockExcel(file)
      const data = setTodayImports(parsedItems, { fileName: file.name })

      setItems(data.items)
      setSavedAt(data.savedAt)
      setFileName(data.fileName)
      setUploadedAt(data.uploadedAt)

      const skipNote = skipped.length ? ` (${skipped.length} rows skipped)` : ''
      setToast(`${parsedItems.length} products loaded from Excel${skipNote}.`)
    } catch (err) {
      setError(err.message || 'Failed to read Excel file.')
    } finally {
      setIsUploading(false)
    }
  }

  function handleFileChange(e) {
    processFile(e.target.files?.[0])
    e.target.value = ''
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    processFile(e.dataTransfer.files?.[0])
  }

  function handleDragOver(e) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() {
    setIsDragging(false)
  }

  function handleClear() {
    if (!items.length) return
    if (!window.confirm('Remove today\'s uploaded stock data?')) return
    const data = clearTodayImports()
    setItems(data.items)
    setSavedAt(data.savedAt)
    setFileName(data.fileName)
    setUploadedAt(data.uploadedAt)
    setToast('Uploaded data cleared.')
  }

  function handleSave() {
    if (!items.length) {
      setError('Upload an Excel file before saving.')
      return
    }
    const data = saveDailyImport()
    setSavedAt(data.savedAt)
    setToast('Daily stock import saved. Dashboard & reports will use this data.')
  }

  return (
    <div className="import-page">
      <div className="module-header">
        <div className="module-header__main">
          <h2>Daily Stock Import</h2>
          <p>Super Admin uploads today&apos;s stock via Excel — feeds dashboard &amp; reports</p>
        </div>
        <span className="module-header__badge">
          {isSuperAdmin ? 'Super Admin' : 'Staff'}
        </span>
      </div>

      {toast && (
        <div className="import-toast import-toast--saved">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {toast}
        </div>
      )}

      {error && <p className="import-form__error import-form__error--page">{error}</p>}

      <div className="import-summary">
        <div className="import-summary__card">
          <div className="import-summary__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
              <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="import-summary__label">Import Date</p>
            <p className="import-summary__value">{formatTodayLabel()}</p>
          </div>
        </div>

        <div className="import-summary__card">
          <div className="import-summary__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-14L4 7m8 4v10" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="import-summary__label">Products</p>
            <p className="import-summary__value">{summary.productCount}</p>
          </div>
        </div>

        <div className="import-summary__card">
          <div className="import-summary__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </div>
          <div>
            <p className="import-summary__label">Total Weight</p>
            <p className="import-summary__value">{summary.totalWeight.toFixed(1)}g</p>
          </div>
        </div>

        <div className="import-summary__card">
          <div className="import-summary__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="import-summary__label">Stock Value</p>
            <p className="import-summary__value">{formatCurrency(summary.totalValue)}</p>
          </div>
        </div>
      </div>

      <div className="import-upload-card">
        <div className="import-upload-card__head">
          <div>
            <h3>Upload Excel File</h3>
            <p>Upload daily stock sheet — .xlsx or .xls only</p>
          </div>
          <button type="button" className="import-btn import-btn--ghost import-btn--template" onClick={downloadStockTemplate}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3v12M8 11l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Download Template
          </button>
        </div>

        <div
          className={`import-dropzone${isDragging ? ' import-dropzone--active' : ''}${isUploading ? ' import-dropzone--loading' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleFileChange}
            hidden
          />

          <div className="import-dropzone__icon">
            {isUploading ? (
              <span className="import-spinner" aria-hidden="true" />
            ) : (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M14 2v6h6M8 13h2M8 17h8M8 9h1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            )}
          </div>

          <h4>{isUploading ? 'Reading Excel file...' : 'Drag & drop Excel here'}</h4>
          <p>or click to browse from your computer</p>
          <span className="import-dropzone__hint">Supports .xlsx and .xls · Max recommended 500 rows</span>
        </div>

        <div className="import-format-guide">
          <p className="import-format-guide__title">Required Excel columns</p>
          <div className="import-format-guide__tags">
            <span>Product Name</span>
            <span>Category</span>
            <span>Purity</span>
            <span>Weight (g)</span>
            <span>Qty</span>
            <span>Price (₹)</span>
          </div>
        </div>

        {fileName && (
          <div className="import-file-info">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
            <div>
              <p className="import-file-info__name">{fileName}</p>
              <p className="import-file-info__meta">
                {items.length} products loaded
                {uploadedAt && ` · Uploaded ${new Date(uploadedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
              </p>
            </div>
            <button
              type="button"
              className="import-btn import-btn--ghost import-btn--reupload"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              Re-upload
            </button>
          </div>
        )}
      </div>

      <div className="import-list-card">
        <div className="import-list-card__head">
          <div>
            <h3>Imported Stock Preview</h3>
            <p>
              {savedAt
                ? `Saved at ${new Date(savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                : 'Data from uploaded Excel — review before saving'}
            </p>
          </div>
          <span className="import-list-card__count">{items.length} items</span>
        </div>

        <div className="import-list-card__body">
          {items.length === 0 ? (
            <div className="import-empty">
              <div className="import-empty__icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <path d="M14 2v6h6M8 13h2M8 17h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <h4>No Excel uploaded yet</h4>
              <p>Download the template, fill in today&apos;s stock, then upload the Excel file above.</p>
            </div>
          ) : (
            <div className="import-table-wrap">
              <table className="import-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Purity</th>
                    <th>Weight</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1}</td>
                      <td className="import-table__name">{item.name}</td>
                      <td><span className={categoryBadge(item.category)}>{item.category}</span></td>
                      <td>{item.purity}</td>
                      <td>{item.weight}g</td>
                      <td>{item.qty}</td>
                      <td className="import-table__price">{formatCurrency(item.price)}</td>
                      <td className="import-table__price">{formatCurrency(item.price * item.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="import-actions">
          <p className="import-actions__left">
            {items.length
              ? `${summary.totalItems} pcs · ${summary.totalWeight.toFixed(1)}g total · ${formatCurrency(summary.totalValue)}`
              : 'Upload Excel to preview stock data'}
          </p>
          <div className="import-actions__right">
            <button
              type="button"
              className="import-btn import-btn--ghost"
              onClick={handleClear}
              disabled={!items.length || isUploading}
            >
              Clear Upload
            </button>
            <button
              type="button"
              className="import-btn import-btn--save"
              onClick={handleSave}
              disabled={!items.length || isUploading}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M17 21v-8H7v8M7 3v5h8" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
              Save Daily Import
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
