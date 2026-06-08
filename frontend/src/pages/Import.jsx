import { useEffect, useMemo, useRef, useState } from 'react'
import {
  clearTodayImports,
  formatCurrency,
  getImportSummary,
  getTodayImports,
  saveDailyImport,
  setTodayImports,
} from '../services/stockImport.js'
import { downloadStockTemplate, parseStockExcel } from '../utils/parseStockExcel.js'
import './Import.css'

function categoryBadge(cat) {
  const key = cat.toLowerCase()
  if (key === 'gold') return 'badge badge--gold'
  if (key === 'silver') return 'badge badge--silver'
  return 'badge badge--diamond'
}

const ACCEPTED_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]

const PREVIEW_LIMIT = 100

export default function Import() {
  const fileInputRef = useRef(null)
  const [items, setItems] = useState([])
  const [savedAt, setSavedAt] = useState(null)
  const [fileName, setFileName] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const summary = useMemo(() => getImportSummary(items), [items])
  const isTagFormat = useMemo(() => items.some((item) => item.format === 'tag'), [items])
  const previewItems = useMemo(() => items.slice(0, PREVIEW_LIMIT), [items])

  useEffect(() => {
    const data = getTodayImports()
    setItems(data.items)
    setSavedAt(data.savedAt)
    setFileName(data.fileName)
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
      let data
      try {
        data = setTodayImports(parsedItems, { fileName: file.name })
      } catch (storageErr) {
        setItems(parsedItems)
        setFileName(file.name)
        setSavedAt(null)
        throw storageErr
      }

      setItems(data.items)
      setSavedAt(data.savedAt)
      setFileName(data.fileName)

      const skipNote = skipped.length ? ` (${skipped.length} rows skipped)` : ''
      setToast(`${parsedItems.length} products loaded${skipNote}.`)
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

  function handleClear() {
    if (!items.length) return
    if (!window.confirm('Remove uploaded stock data?')) return
    const data = clearTodayImports()
    setItems(data.items)
    setSavedAt(data.savedAt)
    setFileName(data.fileName)
    setToast('Upload cleared.')
  }

  function handleSave() {
    if (!items.length) {
      setError('Upload an Excel file before saving.')
      return
    }
    const data = saveDailyImport()
    setSavedAt(data.savedAt)
    setToast('Daily stock saved successfully.')
  }

  return (
    <div className="import-page">
      {toast && <p className="import-alert import-alert--success">{toast}</p>}
      {error && <p className="import-alert import-alert--error">{error}</p>}

      <div className="import-panel">
        <div className="import-panel__upload">
          <div className="import-panel__top">
            <button type="button" className="import-link-btn" onClick={downloadStockTemplate}>
              Download sample format
            </button>
          </div>

          <div
            className={`import-drop${isDragging ? ' import-drop--active' : ''}${isUploading ? ' import-drop--loading' : ''}`}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              hidden
            />
            {isUploading ? (
              <span className="import-drop__spinner" aria-hidden="true" />
            ) : (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3v12M8 11l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            )}
            <p className="import-drop__title">
              {isUploading ? 'Reading file...' : 'Drop Excel here or click to browse'}
            </p>
            <p className="import-drop__hint">.xlsx or .xls</p>
          </div>

          {fileName && (
            <p className="import-file">
              <strong>{fileName}</strong>
              <span> · {items.length} products</span>
            </p>
          )}
        </div>

        <div className="import-panel__divider" />

        <div className="import-panel__preview">
          {items.length === 0 ? (
            <div className="import-empty">
              <p>No data yet</p>
              <span>Upload Excel to preview today&apos;s stock</span>
            </div>
          ) : (
            <>
              {items.length > PREVIEW_LIMIT && (
                <p className="import-preview-note">
                  Showing first {PREVIEW_LIMIT} of {items.length.toLocaleString('en-IN')} tags
                </p>
              )}
              <div className="import-table-wrap">
                <table className="import-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      {isTagFormat ? (
                        <>
                          <th>Tag No</th>
                          <th>Product</th>
                          <th>Sub Product</th>
                          <th>Pieces</th>
                          <th>Net Wt</th>
                          <th>Gross Wt</th>
                          <th>Counter</th>
                        </>
                      ) : (
                        <>
                          <th>Product</th>
                          <th>Category</th>
                          <th>Purity</th>
                          <th>Weight</th>
                          <th>Qty</th>
                          <th>Price</th>
                          <th>Total</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {previewItems.map((item, index) => (
                      <tr key={item.id || `${item.tagNo}-${index}`}>
                        <td>{index + 1}</td>
                        {isTagFormat ? (
                          <>
                            <td className="import-table__tag">{item.tagNo}</td>
                            <td className="import-table__name">{item.name}</td>
                            <td>{item.subProduct || '—'}</td>
                            <td>{item.qty}</td>
                            <td>{item.netWeight || item.weight}g</td>
                            <td>{item.grossWeight ? `${item.grossWeight}g` : '—'}</td>
                            <td>{item.counter || '—'}</td>
                          </>
                        ) : (
                          <>
                            <td className="import-table__name">{item.name}</td>
                            <td><span className={categoryBadge(item.category)}>{item.category}</span></td>
                            <td>{item.purity}</td>
                            <td>{item.weight}g</td>
                            <td>{item.qty}</td>
                            <td>{formatCurrency(item.price)}</td>
                            <td>{formatCurrency(item.price * item.qty)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="import-panel__footer">
          <p className="import-panel__meta">
            {items.length
              ? `${summary.productCount.toLocaleString('en-IN')} tags · ${summary.totalItems.toLocaleString('en-IN')} pieces · ${summary.totalWeight.toFixed(1)}g${summary.hasPrice ? ` · ${formatCurrency(summary.totalValue)}` : ''}`
              : savedAt ? 'Previously saved today' : 'Ready for upload'}
          </p>
          <div className="import-panel__actions">
            <button
              type="button"
              className="import-btn import-btn--outline"
              onClick={handleClear}
              disabled={!items.length || isUploading}
            >
              Clear
            </button>
            <button
              type="button"
              className="import-btn import-btn--gold"
              onClick={handleSave}
              disabled={!items.length || isUploading}
            >
              Save import
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
