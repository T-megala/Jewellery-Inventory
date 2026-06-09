import XLSX from 'xlsx';
import { toLocalDateString } from './productBatchHelper.js';

const MONTHS = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

const normalizeHeader = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const formatDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toLocalDateString(value);
  }

  const str = String(value ?? '').trim();
  if (!str) {
    return null;
  }

  const match = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (match) {
    const month = MONTHS[match[2].toLowerCase()];
    if (month) {
      return `${match[3]}-${month}-${match[1].padStart(2, '0')}`;
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? str : toLocalDateString(parsed);
};

const findHeaderRowIndex = (rows) =>
  rows.findIndex((row) => normalizeHeader(row[0]) === 'tranno');

const buildColumnMap = (headers) => {
  const map = {};
  let piecesCount = 0;
  let weightGramCount = 0;
  let weightCaratCount = 0;

  headers.forEach((header, index) => {
    const key = normalizeHeader(header);

    if (key === 'tranno') map.tranNo = index;
    else if (key === 'trandate') map.tranDate = index;
    else if (key === 'product') map.product = index;
    else if (key === 'subproduct') map.subProduct = index;
    else if (key === 'tag/packetno') map.tagPacketNo = index;
    else if (key === 'grosswt') map.grossWt = index;
    else if (key === 'netwt') map.netWt = index;
    else if (key === 'counter') map.counter = index;
    else if (key === 'size') map.size = index;
    else if (key === 'tagtype') map.tagType = index;
    else if (key === 'pieces') {
      piecesCount += 1;
      map[piecesCount === 1 ? 'pieces' : 'stonePieces'] = index;
    } else if (key === 'weight(gram)') {
      weightGramCount += 1;
      if (weightGramCount === 1) map.weightGram = index;
    } else if (key === 'weight(carat)') {
      weightCaratCount += 1;
      if (weightCaratCount === 1) map.weightCarat = index;
    }
  });

  return map;
};

const getCell = (row, index) => {
  if (index === undefined || index === null) {
    return '';
  }
  return row[index] ?? '';
};

const isGroupHeaderRow = (row) => {
  const product = String(row.product ?? '').trim();
  const tranNo = String(row.tranNo ?? '').trim();
  const tagNo = String(row.tagPacketNo ?? '').trim();

  return Boolean(product && !tranNo && !tagNo);
};

const isDataRow = (row) => {
  const tranNo = String(row.tranNo ?? '').trim();
  const tagNo = String(row.tagPacketNo ?? '').trim();
  const product = String(row.product ?? '').trim();

  if (!tranNo || !tagNo || !product) {
    return false;
  }

  if (!/^\d+$/.test(tranNo)) {
    return false;
  }

  if (/^\d+$/.test(tagNo)) {
    return false;
  }

  return true;
};

const mapRawRow = (rawRow, columnMap) => ({
  tranNo: getCell(rawRow, columnMap.tranNo),
  tranDate: getCell(rawRow, columnMap.tranDate),
  product: getCell(rawRow, columnMap.product),
  subProduct: getCell(rawRow, columnMap.subProduct),
  tagPacketNo: getCell(rawRow, columnMap.tagPacketNo),
  pieces: getCell(rawRow, columnMap.pieces),
  grossWt: getCell(rawRow, columnMap.grossWt),
  netWt: getCell(rawRow, columnMap.netWt),
  counter: getCell(rawRow, columnMap.counter),
  size: getCell(rawRow, columnMap.size),
  tagType: getCell(rawRow, columnMap.tagType),
  stonePieces: getCell(rawRow, columnMap.stonePieces),
  weightGram: getCell(rawRow, columnMap.weightGram),
  weightCarat: getCell(rawRow, columnMap.weightCarat),
});

const toDbRow = (row) => ({
  tran_no: String(row.tranNo ?? '').trim() || null,
  tran_date: formatDate(row.tranDate),
  product: String(row.product).trim(),
  sub_product: String(row.subProduct).trim(),
  tag_packet_no: String(row.tagPacketNo).trim(),
  pieces: toNumber(row.pieces),
  gross_wt: toNumber(row.grossWt),
  net_wt: toNumber(row.netWt),
  counter_name: String(row.counter).trim(),
  size: String(row.size ?? '').trim() || null,
  tag_type: String(row.tagType ?? '').trim() || null,
  item_pieces: toNumber(row.stonePieces),
  weight_gram: toNumber(row.weightGram),
  weight_carat: toNumber(row.weightCarat),
});

export const parseStockExcel = (buffer) => {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    cellNF: false,
    cellStyles: false,
    sheetStubs: false,
  });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error('Excel file does not contain any sheets');
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const headerIndex = findHeaderRowIndex(rows);

  if (headerIndex === -1) {
    throw new Error('Header row with TranNo was not found in the Excel file');
  }

  const columnMap = buildColumnMap(rows[headerIndex]);
  const requiredColumns = ['tranNo', 'product', 'subProduct', 'tagPacketNo'];

  for (const column of requiredColumns) {
    if (columnMap[column] === undefined) {
      throw new Error(`Required column "${column}" was not found in the Excel file`);
    }
  }

  const dataRows = rows.slice(headerIndex + 1);
  const validRows = [];
  let skipped = 0;

  for (const rawRow of dataRows) {
    const row = mapRawRow(rawRow, columnMap);

    if (isGroupHeaderRow(row)) {
      skipped += 1;
      continue;
    }

    if (!isDataRow(row)) {
      skipped += 1;
      continue;
    }

    validRows.push(toDbRow(row));
  }

  return {
    validRows,
    totalRowsInFile: dataRows.length,
    skipped,
  };
};
