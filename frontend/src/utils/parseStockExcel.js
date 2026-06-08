import * as XLSX from 'xlsx'

const COLUMN_KEYS = {
  name: ['product name', 'product', 'name', 'item name', 'item'],
  category: ['category', 'type', 'metal'],
  purity: ['purity', 'karat', 'k'],
  weight: ['weight (g)', 'weight(g)', 'weight', 'wt', 'grams'],
  qty: ['qty', 'quantity', 'qnty', 'pcs', 'count'],
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
  if (text.includes('gold')) return 'Gold'
  if (text.includes('silver')) return 'Silver'
  if (text.includes('diamond')) return 'Diamond'
  return String(value || 'Gold').trim() || 'Gold'
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

        if (!rows.length || rows.length < 2) {
          reject(new Error('Excel file is empty. Add products below the header row.'))
          return
        }

        const headers = rows[0]
        const nameIdx = findColumnIndex(headers, COLUMN_KEYS.name)
        const categoryIdx = findColumnIndex(headers, COLUMN_KEYS.category)
        const purityIdx = findColumnIndex(headers, COLUMN_KEYS.purity)
        const weightIdx = findColumnIndex(headers, COLUMN_KEYS.weight)
        const qtyIdx = findColumnIndex(headers, COLUMN_KEYS.qty)
        const priceIdx = findColumnIndex(headers, COLUMN_KEYS.price)

        if (nameIdx === -1 || weightIdx === -1 || qtyIdx === -1 || priceIdx === -1) {
          reject(new Error(
            'Excel must have columns: Product Name, Weight, Qty, Price. Download the template for correct format.',
          ))
          return
        }

        const items = []
        const skipped = []

        for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
          const row = rows[rowIndex]
          const isEmpty = row.every((cell) => !String(cell).trim())
          if (isEmpty) continue

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
          })
        }

        if (!items.length) {
          reject(new Error(skipped[0] || 'No valid products found in the Excel file.'))
          return
        }

        resolve({ items, skipped, sheetName })
      } catch {
        reject(new Error('Could not read Excel file. Please upload a valid .xlsx or .xls file.'))
      }
    }

    reader.onerror = () => reject(new Error('Failed to read the uploaded file.'))
    reader.readAsArrayBuffer(file)
  })
}

export function downloadStockTemplate() {
  const headers = ['Product Name', 'Category', 'Purity', 'Weight (g)', 'Qty', 'Price (₹)']
  const sampleRows = [
    ['Gold Chain 22K', 'Gold', '22K', 12.5, 8, 45000],
    ['Silver Ring', 'Silver', '925', 4.2, 15, 3200],
    ['Diamond Pendant', 'Diamond', '18K', 2.1, 3, 28500],
    ['Gold Bangle 24K', 'Gold', '24K', 28, 5, 98000],
  ]

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...sampleRows])
  sheet['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 14 }]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Daily Stock')
  XLSX.writeFile(workbook, 'Jeyachandran_Daily_Stock_Template.xlsx')
}
