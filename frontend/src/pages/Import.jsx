import { useEffect, useRef, useState } from 'react'
import { uploadStockExcel } from '../services/import.js'
import './Import.css'

const ACCEPTED_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString('en-IN')
}

function StepItem({ number, label, state }) {
  return (
    <div className={`import-step import-step--${state}`}>
      <span className="import-step__dot">{state === 'done' ? '✓' : number}</span>
      <span className="import-step__label">{label}</span>
    </div>
  )
}

export default function Import() {
  const fileInputRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [result, setResult] = useState(null)
  const [importStatus, setImportStatus] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(''), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  function selectFile(file) {
    if (!file) return

    const isExcel = ACCEPTED_TYPES.includes(file.type)
      || file.name.endsWith('.xlsx')
      || file.name.endsWith('.xls')

    if (!isExcel) {
      setError('Please choose a valid .xlsx Excel file.')
      setSelectedFile(null)
      setResult(null)
      setImportStatus(null)
      return
    }

    setError('')
    setResult(null)
    setImportStatus(null)
    setSelectedFile(file)
  }

  async function handleSend() {
    if (!selectedFile || isUploading) return

    setError('')
    setImportStatus(null)
    setIsUploading(true)

    try {
      const importResult = await uploadStockExcel(selectedFile, {
        onProgress: setImportStatus,
      })
      setResult(importResult)
      setToast('Import completed successfully.')
    } catch (err) {
      setError(err.message || 'Failed to upload Excel file.')
    } finally {
      setIsUploading(false)
      setImportStatus(null)
    }
  }

  function handleFileChange(e) {
    selectFile(e.target.files?.[0])
    e.target.value = ''
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    selectFile(e.dataTransfer.files?.[0])
  }

  function handleReset() {
    setSelectedFile(null)
    setResult(null)
    setImportStatus(null)
    setError('')
  }

  const step1State = selectedFile ? 'done' : 'active'
  const step2State = result ? 'done' : selectedFile ? 'active' : 'pending'
  const step3State = result ? 'active' : 'pending'
  const progressValue = importStatus?.progress ?? 0
  const progressLabel = importStatus?.message || 'Processing import…'

  return (
    <div className="import-page">
      {toast && (
        <div className="import-toast import-toast--success" role="status">{toast}</div>
      )}

      <nav className="import-steps" aria-label="Upload progress">
        <StepItem number="1" label="Choose file" state={step1State} />
        <span className="import-steps__line" aria-hidden="true" />
        <StepItem number="2" label="Send" state={step2State} />
        <span className="import-steps__line" aria-hidden="true" />
        <StepItem number="3" label="Done" state={step3State} />
      </nav>

      <section className="import-workspace">
        <div className="import-workspace__col">
          <p className="import-workspace__label">Choose Excel file</p>
          <div
            className={`import-drop${isDragging ? ' import-drop--active' : ''}${isUploading ? ' import-drop--locked' : ''}`}
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
            <div className="import-drop__icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M12 3v12M8 11l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <p className="import-drop__label">Drop file here or click to browse</p>
            <p className="import-drop__hint">.xlsx only</p>
          </div>
        </div>

        <div className="import-workspace__divider" aria-hidden="true" />

        <div className="import-workspace__col">
          <p className="import-workspace__label">Review &amp; send</p>

          {!selectedFile && !result && (
            <div className="import-placeholder">
              <div className="import-placeholder__icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </div>
              <p>No file selected</p>
              <span>Choose an Excel file to continue</span>
            </div>
          )}

          {selectedFile && !result && (
            <div className="import-action">
              <div className="import-file">
                <div className="import-file__icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                </div>
                <div className="import-file__body">
                  <strong>{selectedFile.name}</strong>
                  <span>{formatFileSize(selectedFile.size)}</span>
                </div>
                <button
                  type="button"
                  className="import-file__clear"
                  onClick={handleReset}
                  disabled={isUploading}
                  aria-label="Remove file"
                >
                  ×
                </button>
              </div>

              {isUploading && importStatus && (
                <div className="import-progress" aria-live="polite">
                  <div className="import-progress__head">
                    <span>{progressLabel}</span>
                    <strong>{progressValue}%</strong>
                  </div>
                  <div className="import-progress__track">
                    <div
                      className="import-progress__bar"
                      style={{ width: `${progressValue}%` }}
                    />
                  </div>
                  {importStatus.total > 0 && (
                    <p className="import-progress__meta">
                      {formatCount(importStatus.processed)} of {formatCount(importStatus.total)} rows
                    </p>
                  )}
                </div>
              )}

              {error && <p className="import-msg import-msg--error" role="alert">{error}</p>}

              <button
                type="button"
                className="import-send"
                onClick={handleSend}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <span className="import-send__spin" aria-hidden="true" />
                    Importing…
                  </>
                ) : (
                  'Send'
                )}
              </button>
            </div>
          )}

          {result && (
            <div className="import-success import-success--simple">
              <span className="import-success__tick import-success__tick--large" aria-hidden="true">✓</span>
              <p className="import-success__title">Import completed</p>
              <p className="import-success__file">{selectedFile?.name}</p>
              <button type="button" className="import-send import-send--outline" onClick={handleReset}>
                Upload another file
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
