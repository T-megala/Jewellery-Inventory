const STORAGE_PREFIX = 'daily_stock_import_'

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function storageKey(date = todayKey()) {
  return `${STORAGE_PREFIX}${date}`
}

function readDay(date) {
  try {
    const raw = localStorage.getItem(storageKey(date))
    return raw ? JSON.parse(raw) : { date, items: [], savedAt: null, fileName: null, uploadedAt: null }
  } catch {
    return { date, items: [], savedAt: null, fileName: null, uploadedAt: null }
  }
}

function writeDay(data) {
  try {
    localStorage.setItem(storageKey(data.date), JSON.stringify(data))
  } catch {
    throw new Error('Upload is too large to store in the browser. Backend storage will be needed for full bulk imports.')
  }
}

export function getTodayImports() {
  return readDay(todayKey())
}

export function setTodayImports(items, meta = {}) {
  const data = {
    date: todayKey(),
    items: items.map((item) => ({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...item,
    })),
    savedAt: null,
    fileName: meta.fileName || null,
    uploadedAt: meta.uploadedAt || new Date().toISOString(),
  }
  writeDay(data)
  return data
}

export function clearTodayImports() {
  const data = {
    date: todayKey(),
    items: [],
    savedAt: null,
    fileName: null,
    uploadedAt: null,
  }
  writeDay(data)
  return data
}

export function saveDailyImport() {
  const data = readDay(todayKey())
  data.savedAt = new Date().toISOString()
  writeDay(data)
  return data
}

export function getImportSummary(items) {
  const totalItems = items.reduce((sum, item) => sum + Number(item.qty || 0), 0)
  const totalWeight = items.reduce((sum, item) => {
    const weight = Number(item.weight || 0)
    const qty = Number(item.qty || 0)
    if (item.format === 'tag') return sum + weight
    return sum + weight * qty
  }, 0)
  const totalValue = items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0),
    0,
  )
  const hasPrice = items.some((item) => Number(item.price) > 0)

  return { totalItems, totalWeight, totalValue, productCount: items.length, hasPrice }
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}
