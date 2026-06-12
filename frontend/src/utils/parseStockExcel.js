import * as XLSX from 'xlsx'

export const STOCK_TEMPLATE_PATH = '/sample_excel_format/Tag Product List (1).xlsx'
export const STOCK_TEMPLATE_FILENAME = 'BrandFactory_Stock_Format.xlsx'

const SIMPLE_COLUMN_KEYS = {
  name: ['product name', 'product', 'name', 'item name', 'item'],
  category: ['category', 'type', 'metal'],
  purity: ['purity', 'karat', 'k'],
  weight: ['weight (g)', 'weight(g)', 'weight', 'wt', 'grams', 'netwt', 'grosswt'],
  qty: ['qty', 'quantity', 'qnty', 'pcs', 'count', 'pieces'],
  price: ['price (₹)', 'price', 'selling price', 'amount', 'rate', 'mrp'],
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase()
}

function findColumnIndex(headers, keys) {
  const normalized = headers.map(normalizeHeader)
  for (let i = 0; i < normalized.length; i += 1) {
    const header = normalized[i]
    if (keys.some((key) => header === key || header.includes(key))) {
      return i
    }
  }
  return -1
}

function parseNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  const num = Number(String(value).replace(/[,₹\s]/g, ''))
  return Number.isFinite(num) ? num : fallback
}

function normalizeCategory(value) {
  const text = String(value || '').trim().toLowerCase()
  if (text.includes('silver')) return 'Silver'
  if (text.includes('diamond') || text.includes('stud')) return 'Diamond'
  if (text.includes('gold') || text.includes('ct') || text.includes('karat') || text.includes('k')) {
    return 'Gold'
  }
  return String(value || 'Gold').trim() || 'Gold'
}

function extractPurity(product, subProduct) {
  const text = `${product} ${subProduct}`.toUpperCase()
  const match = text.match(/(\d{1,2})\s*(?:CT|K|KARAT|CARAT)\b/)
  if (match) return `${match[1]}K`
  if (text.includes('925')) return '925'
  return '-'
}

function isTagWiseReport(rows) {
  const preview = rows.slice(0, 12).flat().join(' ').toLowerCase()
  return preview.includes('tag wise stock report')
    || rows.some((row) => normalizeHeader(row[0]) === 'tranno')
}

function findTagHeaderRow(rows) {
  return rows.findIndex((row) => normalizeHeader(row[0]) === 'tranno')
}

function isEmptyRow(row) {
  return row.every((cell) => !String(cell).trim())
}

function isGroupHeaderRow(row) {
  const values = [...new Set(row.map((cell) => String(cell).trim()).filter(Boolean))]
  return values.length === 1 && values[0].length > 2
}

function isSubtotalRow(row) {
  const tranNo = row[0]
  const product = String(row[2] || '').trim()
  const tagCell = String(row[4] || '').trim()
  return !tranNo && !product && tagCell && Number.isFinite(Number(tagCell)) && Number(tagCell) > 0
}

function parseTagWiseStock(rows) {
  const headerIdx = findTagHeaderRow(rows)
  if (headerIdx === -1) {
    throw new Error('Could not find stock columns in the Tag Wise Stock Report.')
  }

  const items = []
  const skipped = []
  let currentProduct = ''

  for (let rowIndex = headerIdx + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    if (isEmptyRow(row)) continue

    if (isGroupHeaderRow(row)) {
      currentProduct = String(row[2] || row[0] || '').trim()
      continue
    }

    if (isSubtotalRow(row)) continue

    const product = String(row[2] || currentProduct || '').trim()
    const subProduct = String(row[3] || '').trim()
    const tagNo = String(row[4] || '').trim()
    const qty = parseNumber(row[5], 0)
    const grossWt = parseNumber(row[6])
    const netWt = parseNumber(row[7])
    const counter = String(row[8] || '').trim()
    const weight = netWt > 0 ? netWt : grossWt

    if (!tagNo || qty <= 0 || weight <= 0) {
      if (tagNo || product) {
        skipped.push(`Row ${rowIndex + 1}: incomplete tag row`)
      }
      continue
    }

    if (!product) {
      skipped.push(`Row ${rowIndex + 1}: missing product name`)
      continue
    }

    items.push({
      name: product,
      subProduct,
      tagNo,
      tranNo: row[0] ? String(row[0]) : '',
      category: normalizeCategory(product),
      purity: extractPurity(product, subProduct),
      weight,
      grossWeight: grossWt,
      netWeight: netWt,
      qty,
      price: 0,
      counter,
      format: 'tag',
    })
  }

  if (!items.length) {
    throw new Error(skipped[0] || 'No valid tag stock rows found in the Excel file.')
  }

  return { items, skipped, sheetName: 'Tag Wise Stock', format: 'tag' }
}

function parseSimpleStock(rows, sheetName) {
  const headers = rows[0]
  const nameIdx = findColumnIndex(headers, SIMPLE_COLUMN_KEYS.name)
  const categoryIdx = findColumnIndex(headers, SIMPLE_COLUMN_KEYS.category)
  const purityIdx = findColumnIndex(headers, SIMPLE_COLUMN_KEYS.purity)
  const weightIdx = findColumnIndex(headers, SIMPLE_COLUMN_KEYS.weight)
  const qtyIdx = findColumnIndex(headers, SIMPLE_COLUMN_KEYS.qty)
  const priceIdx = findColumnIndex(headers, SIMPLE_COLUMN_KEYS.price)

  if (nameIdx === -1 || weightIdx === -1 || qtyIdx === -1 || priceIdx === -1) {
    throw new Error(
      'Excel must have columns: Product Name, Weight, Qty, Price — or use the Tag Wise Stock Report format.',
    )
  }

  const items = []
  const skipped = []

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    if (isEmptyRow(row)) continue

    const name = String(row[nameIdx] || '').trim()
    const weight = parseNumber(row[weightIdx])
    const qty = parseNumber(row[qtyIdx], 1)
    const price = parseNumber(row[priceIdx])

    if (!name) {
      skipped.push(`Row ${rowIndex + 1}: missing product name`)
      continue
    }
    if (weight <= 0) {
      skipped.push(`Row ${rowIndex + 1}: invalid weight`)
      continue
    }
    if (qty <= 0) {
      skipped.push(`Row ${rowIndex + 1}: invalid quantity`)
      continue
    }
    if (price <= 0) {
      skipped.push(`Row ${rowIndex + 1}: invalid price`)
      continue
    }

    items.push({
      name,
      category: normalizeCategory(categoryIdx >= 0 ? row[categoryIdx] : 'Gold'),
      purity: purityIdx >= 0 ? String(row[purityIdx] || '-').trim() : '-',
      weight,
      qty,
      price,
      format: 'simple',
    })
  }

  if (!items.length) {
    throw new Error(skipped[0] || 'No valid products found in the Excel file.')
  }

  return { items, skipped, sheetName, format: 'simple' }
}

function parseWorkbookRows(rows, sheetName) {
  if (!rows.length) {
    throw new Error('Excel file is empty.')
  }

  if (isTagWiseReport(rows)) {
    return parseTagWiseStock(rows)
  }

  if (rows.length < 2) {
    throw new Error('Excel file is empty. Add products below the header row.')
  }

  return parseSimpleStock(rows, sheetName)
}

export function parseStockExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
        const result = parseWorkbookRows(rows, sheetName)
        resolve(result)
      } catch (err) {
        reject(new Error(err.message || 'Could not read Excel file. Please upload a valid .xlsx or .xls file.'))
      }
    }

    reader.onerror = () => reject(new Error('Failed to read the uploaded file.'))
    reader.readAsArrayBuffer(file)
  })
}

export function downloadStockTemplate() {
  const link = document.createElement('a')
  link.href = STOCK_TEMPLATE_PATH
  link.download = STOCK_TEMPLATE_FILENAME
  document.body.appendChild(link)
  link.click()
  link.remove()
}
