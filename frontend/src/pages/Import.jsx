import { useEffect, useRef, useState } from 'react'
import { useBranchScope } from '../hooks/useBranchScope.js'
import {
  getUser,
  hasPermission,
  isAuthenticated,
  isLogoutInProgress,
  setOperationalBranch,
} from '../services/auth.js'
import { uploadStockExcel } from '../services/import.js'
import './Import.css'
import './Module.css'

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

function formatElapsed(seconds) {
  const safe = Math.max(0, Number(seconds) || 0)
  if (safe < 60) {
    return `${safe}s`
  }

  const minutes = Math.floor(safe / 60)
  const remainder = safe % 60
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`
}

function formatUploadBytes(loaded, total) {
  if (!total) {
    return ''
  }

  const toMb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${toMb(loaded)} / ${toMb(total)}`
}

function estimateImportDurationLabel(bytes) {
  if (!bytes || bytes < 5 * 1024 * 1024) {
    return null
  }

  if (bytes < 20 * 1024 * 1024) {
    return 'Large file — upload and processing may take about 1–2 minutes.'
  }

  return 'Very large file — this may take several minutes. Please keep this tab open.'
}

const IMPORT_PHASES = [
  { id: 'upload', label: 'Upload' },
  { id: 'parse', label: 'Parse' },
  { id: 'import', label: 'Import' },
  { id: 'done', label: 'Done' },
]

function resolvePhaseIndex(phase) {
  switch (phase) {
    case 'uploading':
      return 0
    case 'queued':
    case 'starting':
    case 'parsing':
    case 'preparing':
      return 1
    case 'inserting':
    case 'updating':
    case 'processing':
      return 2
    case 'completed':
      return 3
    default:
      return 1
  }
}

function PhasePipeline({ activeIndex }) {
  return (
    <div className="import-phase-pipeline" aria-label="Import stages">
      {IMPORT_PHASES.map((item, index) => {
        let state = 'pending'
        if (index < activeIndex) {
          state = 'done'
        } else if (index === activeIndex) {
          state = 'active'
        }

        return (
          <div key={item.id} className="import-phase-pipeline__item">
            <div className={`import-phase-pipeline__step import-phase-pipeline__step--${state}`}>
              <span>{state === 'done' ? '✓' : index + 1}</span>
              <strong>{item.label}</strong>
            </div>
            {index < IMPORT_PHASES.length - 1 && (
              <div
                className={`import-phase-pipeline__connector${index < activeIndex ? ' import-phase-pipeline__connector--done' : ''}`}
                aria-hidden="true"
              />
            )}
          </div>
        )
      })}
    </div>
  )
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
  const user = getUser()
  const canImport = hasPermission('products.import', user)
  const fileInputRef = useRef(null)
  const { sessionBranches, operationalBranchId } = useBranchScope()
  const [chosenBranchId, setChosenBranchId] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [result, setResult] = useState(null)
  const [importStatus, setImportStatus] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(''), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!isUploading) {
      setElapsedSec(0)
      return undefined
    }

    const startedAt = Date.now()
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)

    return () => clearInterval(timer)
  }, [isUploading])

  useEffect(() => {
    if (sessionBranches.length === 1) {
      setChosenBranchId(String(sessionBranches[0].id))
      return
    }
    if (operationalBranchId) {
      setChosenBranchId(String(operationalBranchId))
      return
    }
    setChosenBranchId('')
  }, [sessionBranches, operationalBranchId])

  const importBranchId = sessionBranches.length === 1
    ? sessionBranches[0].id
    : chosenBranchId
      ? Number(chosenBranchId)
      : null
  const needsBranchSelection = sessionBranches.length > 1
  const hasNoBranches = sessionBranches.length === 0

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
    if (!selectedFile || isUploading || !importBranchId) return

    setError('')
    setImportStatus({
      status: 'processing',
      phase: 'uploading',
      progress: 2,
      message: 'Starting upload…',
      processed: 0,
      total: 0,
    })
    setIsUploading(true)

    try {
      const importResult = await uploadStockExcel(selectedFile, {
        branchId: importBranchId,
        onProgress: setImportStatus,
      })
      setResult(importResult)
      setToast('Import completed successfully.')
    } catch (err) {
      setError(err.message || 'Failed to upload Excel file.')
    } finally {
      setIsUploading(false)
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
  const progressLabel = importStatus?.message
    || (isUploading ? 'Uploading file…' : 'Processing import…')
  const activePhaseIndex = resolvePhaseIndex(importStatus?.phase)
  const durationHint = selectedFile ? estimateImportDurationLabel(selectedFile.size) : null
  const uploadMeta = importStatus?.phase === 'uploading' && importStatus?.uploadTotal > 0
    ? formatUploadBytes(importStatus.uploadLoaded ?? 0, importStatus.uploadTotal)
    : ''

  if (isLogoutInProgress()) {
    return null
  }

  if (!user || !isAuthenticated()) {
    return null
  }

  if (!canImport) {
    if (isLogoutInProgress()) return null

    return (
      <div className="import-page">
        <div className="module-access-denied">
          <h2>Import access denied</h2>
          <p>You don&apos;t have permission to import stock.</p>
        </div>
      </div>
    )
  }

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

              {durationHint && !isUploading && (
                <p className="import-duration-hint" role="status">{durationHint}</p>
              )}

              {isUploading && (
                <div className="import-progress" aria-live="polite">
                  <PhasePipeline activeIndex={activePhaseIndex} />
                  <div className="import-progress__head">
                    <span>{progressLabel}</span>
                    <strong>{progressValue}%</strong>
                  </div>
                  <div className="import-progress__track">
                    <div
                      className={`import-progress__bar${progressValue <= 3 ? ' import-progress__bar--pulse' : ''}`}
                      style={{ width: `${Math.max(progressValue, 3)}%` }}
                    />
                  </div>
                  <div className="import-progress__meta-row">
                    {importStatus?.total > 0 ? (
                      <p className="import-progress__meta">
                        {formatCount(importStatus.processed)} of {formatCount(importStatus.total)} rows
                      </p>
                    ) : (
                      <p className="import-progress__meta">
                        {uploadMeta
                          || (importStatus?.phase === 'uploading'
                            ? 'Sending file to server…'
                            : 'Working on your file…')}
                      </p>
                    )}
                    <p className="import-progress__elapsed">Elapsed {formatElapsed(elapsedSec)}</p>
                  </div>
                  <p className="import-progress__hint">
                    Please keep this tab open until the import finishes.
                  </p>
                </div>
              )}

              {error && <p className="import-msg import-msg--error" role="alert">{error}</p>}

              {hasNoBranches && (
                <p className="import-msg import-msg--error" role="alert">
                  You don&apos;t have a branch to import into.
                </p>
              )}

              {needsBranchSelection && (
                <div className="import-branch-field">
                  <label className="import-branch-field__label" htmlFor="import-branch-select">
                    Branch
                  </label>
                  <select
                    id="import-branch-select"
                    value={chosenBranchId}
                    onChange={(e) => {
                      const value = e.target.value
                      setChosenBranchId(value)
                      if (value) {
                        setOperationalBranch(Number(value))
                      }
                    }}
                    disabled={isUploading}
                  >
                    <option value="">Select branch</option>
                    {sessionBranches.map((branch) => (
                      <option key={branch.id} value={String(branch.id)}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {needsBranchSelection && !importBranchId && (
                <p className="import-msg import-msg--info" role="status">
                  Select a branch to import.
                </p>
              )}

              <button
                type="button"
                className="import-send"
                onClick={handleSend}
                disabled={isUploading || !importBranchId || hasNoBranches}
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
              {(result.totalRowsInFile > 0 || result.processed > 0) && (
                <div className="import-success__stats" role="status">
                  {result.totalRowsInFile > 0 && (
                    <span>{formatCount(result.totalRowsInFile)} rows in file</span>
                  )}
                  {result.processed > 0 && (
                    <span>{formatCount(result.processed)} saved</span>
                  )}
                  {result.skipped > 0 && (
                    <span>{formatCount(result.skipped)} skipped</span>
                  )}
                  {result.failed > 0 && (
                    <span>{formatCount(result.failed)} failed</span>
                  )}
                </div>
              )}
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
