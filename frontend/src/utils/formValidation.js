import { toUserErrorMessage } from './userErrorMessage.js'

export function scrollToFirstFieldError(errors, idPrefix = 'field-error-') {
  const firstKey = Object.keys(errors).find((key) => key !== '_form' && errors[key])
  if (!firstKey) return

  requestAnimationFrame(() => {
    const errorEl = document.getElementById(`${idPrefix}${firstKey}`)
    const fieldEl = errorEl?.closest('.users-field, .branches-field, .roles-field, .report-field, .form-field, .import-branch-field')
      ?? document.getElementById(`field-${firstKey}`)?.closest('label, .users-field, .branches-field, .roles-field, .report-field, .form-field')

    fieldEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })

    const focusTarget = fieldEl?.querySelector('input:not([type="checkbox"]):not([type="hidden"]), select, textarea')
    focusTarget?.focus({ preventScroll: true })
  })
}

export function mapUserSaveError(message) {
  const text = toUserErrorMessage(message, 'Failed to save user. Please try again.')
  const lower = text.toLowerCase()

  if (lower.includes('username')) return { username: text }
  if (lower.includes('password')) return { password: text }
  if (lower.includes('role')) return { roleId: text }
  if (lower.includes('branch')) return { branches: text }

  return { _form: text }
}

export function mapBranchSaveError(message) {
  const text = toUserErrorMessage(message, 'Failed to save branch. Please try again.')
  if (text.toLowerCase().includes('name')) return { name: text }
  return { _form: text }
}

export function mapRoleSaveError(message) {
  const text = toUserErrorMessage(message, 'Failed to save role. Please try again.')
  if (text.toLowerCase().includes('name')) return { name: text }
  return { _form: text }
}
