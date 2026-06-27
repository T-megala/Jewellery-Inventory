import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import './DeleteConfirmModal.css'

export default function DeleteConfirmModal({
  open,
  title = 'Confirm delete',
  itemName = '',
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  loading = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !loading) {
        onCancel?.()
      }
    }

    document.body.classList.add('delete-modal-open')
    document.documentElement.classList.add('delete-modal-open')
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.classList.remove('delete-modal-open')
      document.documentElement.classList.remove('delete-modal-open')
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, loading, onCancel])

  if (!open) return null

  const bodyMessage = message ?? (
    <>
      Are you sure you want to delete
      {' '}
      <strong>{itemName}</strong>
      ? This action cannot be undone.
    </>
  )

  return createPortal(
    <div className="delete-modal" role="presentation">
      <button
        type="button"
        className="delete-modal__backdrop"
        onClick={onCancel}
        disabled={loading}
        aria-label="Close delete confirmation"
      />
      <div
        className="delete-modal__panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        aria-describedby="delete-modal-message"
      >
        <header className="delete-modal__header">
          <span className="delete-modal__icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="delete-modal__titles">
            <h2 id="delete-modal-title">{title}</h2>
            <p id="delete-modal-message">{bodyMessage}</p>
          </div>
        </header>

        <footer className="delete-modal__footer">
          <button
            type="button"
            className="delete-modal__btn delete-modal__btn--ghost"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="delete-modal__btn delete-modal__btn--danger"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Deleting…' : confirmLabel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
