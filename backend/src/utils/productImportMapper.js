import { normalizeDate, toLocalDateString } from './productBatchHelper.js';

/**
 * @typedef {'string' | 'integer' | 'decimal' | 'date'} ColumnValueType
 * @typedef {Object} ColumnMappingEntry
 * @property {string[]} headers
 * @property {string} table
 * @property {string} field
 * @property {ColumnValueType} [type]
 * @property {boolean} [required]
 * @property {boolean} [requiredColumn]
 * @property {number} [occurrence]
 * @typedef {{ index: number, priority: number }} ColumnCandidate
 * @typedef {Record<string, Record<string, ColumnCandidate[]>>} DynamicColumnMap
 */

export const normalizeHeader = (value) =>
  String(value ?? '')
    .trim()
    .replace(/^\ufeff/, '')
    .toLowerCase()
    .replace(/[\s_/().-]+/g, '');

const normalizeMappingHeader = (header) => normalizeHeader(header);

/** Prefer MaxWasPerGrm for %; MaxWastage for amount when aliases collide. */
const getWastageHeaderPriority = (normalizedHeader, field) => {
  if (field === 'wastage_percentage') {
    if (
      normalizedHeader.includes('maxwaspergr') ||
      normalizedHeader.includes('waspergr') ||
      normalizedHeader.includes('wastagepercent') ||
      normalizedHeader.includes('wastagepct') ||
      normalizedHeader === 'wastage%'
    ) {
      return 100;
    }

    if (normalizedHeader.startsWith('min')) {
      return 10;
    }

    return 50;
  }

  // wastage_amount: prefer MaxWastage / WastageAmount
  if (
    normalizedHeader === 'maxwastage' ||
    normalizedHeader.includes('wastageamount') ||
    normalizedHeader === 'wastage'
  ) {
    return 100;
  }

  if (normalizedHeader.startsWith('min')) {
    return 10;
  }

  return 50;
};

const getHeaderPriority = (normalizedHeader, field) => {
  if (field === 'wastage_percentage' || field === 'wastage_amount') {
    return getWastageHeaderPriority(normalizedHeader, field);
  }

  return 0;
};

const buildHeaderLookup = (mappings) => {
  const lookup = new Map();

  for (const entry of mappings) {
    for (const header of entry.headers) {
      const key = normalizeMappingHeader(header);
      const list = lookup.get(key) ?? [];

      if (!list.includes(entry)) {
        list.push(entry);
      }

      lookup.set(key, list);
    }
  }

  return lookup;
};

const sortColumnCandidates = (candidates) =>
  [...candidates].sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority;
    }

    // Same priority: prefer later Excel columns (previous last-wins behavior).
    return right.index - left.index;
  });

/**
 * @param {string[]} headers
 * @param {ColumnMappingEntry[]} mappings
 * @returns {DynamicColumnMap}
 */
export const buildDynamicColumnMap = (headers, mappings) => {
  const headerLookup = buildHeaderLookup(mappings);
  const occurrenceCounters = new Map();
  /** @type {DynamicColumnMap} */
  const columnMap = {};

  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (!key) {
      return;
    }

    const entries = headerLookup.get(key);
    if (!entries?.length) {
      return;
    }

    const occurrence = (occurrenceCounters.get(key) ?? 0) + 1;
    occurrenceCounters.set(key, occurrence);

    const matchingEntries = entries.filter(
      (item) => (item.occurrence ?? 1) === occurrence,
    );

    for (const entry of matchingEntries) {
      if (!columnMap[entry.table]) {
        columnMap[entry.table] = {};
      }

      const candidates = columnMap[entry.table][entry.field] ?? [];
      candidates.push({
        index,
        priority: getHeaderPriority(key, entry.field),
      });
      columnMap[entry.table][entry.field] = candidates;
    }
  });

  for (const tableMap of Object.values(columnMap)) {
    for (const field of Object.keys(tableMap)) {
      tableMap[field] = sortColumnCandidates(tableMap[field]);
    }
  }

  return columnMap;
};

const resolveColumnCandidates = (tableMap, field) => {
  const candidates = tableMap?.[field];

  if (!candidates) {
    return [];
  }

  if (Array.isArray(candidates)) {
    return candidates;
  }

  // Backward-compatible single index
  return [{ index: candidates, priority: 0 }];
};

const toNumber = (value, integer = false) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }

  return integer ? Math.trunc(num) : Math.round(num * 1000) / 1000;
};

export const normalizePrintRateValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }

  return Math.round(num * 100) / 100;
};

const PRINT_RATE_PRICING_FIELDS = [
  'sale_value',
  'rate',
  'rate_id',
  'per_pcs_value',
  'per_gram_value',
];

export const sanitizePrintRatePricing = (record) => {
  const pricing = record.product_pricing ?? {};

  for (const field of PRINT_RATE_PRICING_FIELDS) {
    if (field in pricing) {
      pricing[field] = normalizePrintRateValue(pricing[field]);
    }
  }

  record.product_pricing = pricing;
};

const EXCEL_SERIAL_MAX = 1_000_000;
const EXCEL_UNIX_EPOCH_SERIAL = 25_569;

const excelSerialToDateString = (serial) => {
  const utcMs = Math.round((Math.floor(serial) - EXCEL_UNIX_EPOCH_SERIAL) * 86_400_000);
  const date = new Date(utcMs);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

const parseExcelSerialDate = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 1 && value < EXCEL_SERIAL_MAX) {
      return excelSerialToDateString(value);
    }

    return null;
  }

  const str = String(value ?? '').trim();

  if (/^\d+(\.\d+)?$/.test(str)) {
    const serial = Number(str);

    if (serial >= 1 && serial < EXCEL_SERIAL_MAX) {
      return excelSerialToDateString(serial);
    }
  }

  return null;
};

const coerceDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toLocalDateString(value);
  }

  const fromExcelSerial = parseExcelSerialDate(value);
  if (fromExcelSerial) {
    return fromExcelSerial;
  }

  return normalizeDate(value);
};

const parseDecimalInput = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const percentMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*%$/);

    if (percentMatch) {
      return toNumber(percentMatch[1], false);
    }

    const normalized = trimmed.replace(/,/g, '');

    if (normalized !== trimmed) {
      return toNumber(normalized, false);
    }
  }

  return toNumber(value, false);
};

const coerceValue = (value, type = 'string') => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  switch (type) {
    case 'integer':
      return toNumber(value, true);
    case 'decimal':
      return parseDecimalInput(value);
    case 'date':
      return coerceDate(value);
    default:
      return String(value).trim() || null;
  }
};

const getCell = (row, index) => {
  if (index === undefined || index === null) {
    return '';
  }

  return row[index] ?? '';
};

/**
 * Precompute field → type so row mapping only walks detected columns.
 * @param {ColumnMappingEntry[]} mappings
 * @returns {Map<string, ColumnValueType>}
 */
export const buildFieldTypeLookup = (mappings) => {
  const lookup = new Map();

  for (const entry of mappings) {
    const key = `${entry.table}.${entry.field}`;
    if (!lookup.has(key)) {
      lookup.set(key, entry.type ?? 'string');
    }
  }

  return lookup;
};

/**
 * @param {unknown[]} rawRow
 * @param {DynamicColumnMap} columnMap
 * @param {Map<string, ColumnValueType> | ColumnMappingEntry[]} fieldTypesOrMappings
 */
export const mapRawRowToProductRecord = (rawRow, columnMap, fieldTypesOrMappings) => {
  /** @type {Record<string, Record<string, unknown>>} */
  const record = {
    products: {},
    product_master: {},
    product_inventory: {},
    product_pricing: {},
    product_tag_details: {},
  };

  const fieldTypes = Array.isArray(fieldTypesOrMappings)
    ? buildFieldTypeLookup(fieldTypesOrMappings)
    : fieldTypesOrMappings;

  for (const [table, fields] of Object.entries(columnMap)) {
    if (!record[table]) {
      record[table] = {};
    }

    for (const [field, candidateList] of Object.entries(fields)) {
      const candidates = resolveColumnCandidates(fields, field);
      if (candidates.length === 0) {
        continue;
      }

      const type = fieldTypes.get(`${table}.${field}`) ?? 'string';

      for (const candidate of candidates) {
        const coerced = coerceValue(getCell(rawRow, candidate.index), type);

        if (coerced !== null && coerced !== '') {
          record[table][field] = coerced;
          break;
        }
      }
    }
  }

  return record;
};

export const flattenToLegacyProductRow = (record) => {
  const products = record.products ?? {};
  const tagDetails = record.product_tag_details ?? {};
  const pricing = record.product_pricing ?? {};
  const inventory = record.product_inventory ?? {};

  const tagPacketNo =
    products.tag_packet_no ?? tagDetails.tag_no ?? null;

  const legacy = {
    tran_no: products.tran_no ?? null,
    tran_date: products.tran_date ?? null,
    product: products.product ?? null,
    sub_product: products.sub_product ?? null,
    tag_packet_no: tagPacketNo,
    pieces: products.pieces ?? null,
    gross_wt: products.gross_wt ?? null,
    net_wt: products.net_wt ?? null,
    counter_name: products.counter_name ?? null,
    size: products.size ?? null,
    tag_type: products.tag_type ?? null,
    item_pieces: products.item_pieces ?? null,
    weight_gram: products.weight_gram ?? pricing.stone_weight ?? null,
    weight_carat: products.weight_carat ?? pricing.diamond_weight ?? null,
  };

  if (!legacy.sub_product && legacy.product) {
    legacy.sub_product = legacy.product;
  }

  if (legacy.gross_wt == null && legacy.net_wt != null) {
    legacy.gross_wt = legacy.net_wt;
  }

  if (legacy.net_wt == null && legacy.gross_wt != null) {
    legacy.net_wt = legacy.gross_wt;
  }

  if (!legacy.counter_name && inventory.warehouse) {
    legacy.counter_name = String(inventory.warehouse).trim();
  }

  if (!legacy.counter_name && inventory.location) {
    legacy.counter_name = String(inventory.location).trim();
  }

  if (legacy.pieces == null && legacy.tag_packet_no) {
    legacy.pieces = 1;
  }

  return legacy;
};

export const enrichRecordFromProductCodes = (record, lookup = null) => {
  if (!lookup || lookup.size === 0) {
    return;
  }

  const master = record.product_master ?? {};
  const products = record.products ?? {};
  const proCode = master.erp_pro_code;

  if (proCode === null || proCode === undefined || proCode === '') {
    return;
  }

  const numericCode = Number(proCode);
  if (!Number.isInteger(numericCode) || numericCode <= 0) {
    return;
  }

  const resolvedName = lookup.get(numericCode);
  if (!resolvedName) {
    return;
  }

  if (!String(products.product ?? '').trim()) {
    products.product = resolvedName;
  }

  if (!String(products.sub_product ?? '').trim()) {
    products.sub_product = products.product ?? resolvedName;
  }

  record.products = products;
};

export const INHERITABLE_IMPORT_TABLES = [
  'product_master',
  'product_inventory',
  'product_pricing',
  'product_tag_details',
];

export const createEmptyImportContext = () =>
  Object.fromEntries(INHERITABLE_IMPORT_TABLES.map((table) => [table, {}]));

/**
 * Merge group-header context into a tag/data row.
 * Row values win; empty fields inherit from the header (e.g. MaxWasPerGrm, MaxMc).
 */
export const mergeRecordContext = (context, record) => {
  /** @type {Record<string, Record<string, unknown>>} */
  const merged = { ...record };

  for (const table of INHERITABLE_IMPORT_TABLES) {
    merged[table] = {
      ...(context[table] ?? {}),
      ...(record[table] ?? {}),
    };
  }

  return merged;
};

export const mergeIntoImportContext = (context, record, { lockFields = [] } = {}) => {
  const locked = new Set(lockFields);

  for (const table of INHERITABLE_IMPORT_TABLES) {
    const incoming = record[table] ?? {};

    if (Object.keys(incoming).length === 0) {
      continue;
    }

    const current = { ...(context[table] ?? {}) };

    for (const [field, value] of Object.entries(incoming)) {
      if (locked.has(field) && current[field] !== undefined && current[field] !== null) {
        continue;
      }

      current[field] = value;
    }

    context[table] = current;
  }

  return context;
};

/**
 * MaxWasPerGrm / MaxMc / MaxWastage from group headers fill empty tag-row cells.
 * Tag-row values always win when present (store Excel values as-is; no recalculation).
 *
 * @param {{ record: Record<string, Record<string, unknown>>, rowNumber: number }[]} parsedRows
 */
export const applyGroupHeaderInheritance = (parsedRows) => {
  let context = createEmptyImportContext();
  let currentProductKey = null;
  const lockPricingFields = ['wastage_percentage', 'wastage_amount', 'making_charge', 'max_mc'];

  return parsedRows.map(({ record, rowNumber }) => {
    const legacy = flattenToLegacyProductRow(record);

    if (isGroupHeaderRow(legacy)) {
      const productKey = String(legacy.product ?? '').trim().toLowerCase();
      const isNewProduct = Boolean(productKey && productKey !== currentProductKey);

      if (isNewProduct) {
        context = createEmptyImportContext();
        currentProductKey = productKey;
      }

      mergeIntoImportContext(context, record, {
        lockFields: isNewProduct ? [] : lockPricingFields,
      });
      return { record, rowNumber };
    }

    return {
      record: mergeRecordContext(context, record),
      rowNumber,
    };
  });
};

export const hasNormalizedData = (record) => {
  return INHERITABLE_IMPORT_TABLES.some((table) => {
    const data = record[table];
    return data && Object.keys(data).length > 0;
  });
};

export const buildUntaggedRowKey = (legacyRow) =>
  [
    legacyRow.tran_no,
    legacyRow.product,
    legacyRow.sub_product,
    legacyRow.counter_name,
  ]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .join('|');

export const buildTaggedRowKey = (legacyRow) =>
  String(legacyRow.tag_packet_no ?? '').trim().toUpperCase();

export const isGroupHeaderRow = (legacyRow) => {
  const product = String(legacyRow.product ?? '').trim();
  const tranNo = String(legacyRow.tran_no ?? '').trim();
  const tagNo = String(legacyRow.tag_packet_no ?? '').trim();

  return Boolean(product && !tranNo && !tagNo);
};

export const isDataRowCandidate = (legacyRow) => {
  const tranNo = String(legacyRow.tran_no ?? '').trim();
  const tagNo = String(legacyRow.tag_packet_no ?? '').trim();
  const product = String(legacyRow.product ?? '').trim();

  if (!product) {
    return false;
  }

  if (tranNo) {
    return /^\d+$/.test(tranNo);
  }

  return Boolean(tagNo);
};

export const validateRequiredHeaders = (columnMap, requiredFields) => {
  const productsMap = columnMap.products ?? {};
  const missing = requiredFields.filter((field) => {
    const candidates = resolveColumnCandidates(productsMap, field);
    return candidates.length === 0;
  });

  if (missing.length > 0) {
    throw new Error(
      `Required column(s) not found in Excel file: ${missing.join(', ')}`,
    );
  }

  const hasTran = resolveColumnCandidates(productsMap, 'tran_no').length > 0;
  const hasTag = resolveColumnCandidates(productsMap, 'tag_packet_no').length > 0;

  if (!hasTran && !hasTag) {
    throw new Error(
      'Required column(s) not found in Excel file: tran_no or tag_packet_no',
    );
  }
};

const rowContainsMappedField = (rawRow, mappings, table, field) => {
  const aliases = new Set();

  for (const entry of mappings) {
    if (entry.table === table && entry.field === field) {
      for (const header of entry.headers) {
        aliases.add(normalizeHeader(header));
      }
    }
  }

  return rawRow.some((cell) => aliases.has(normalizeHeader(cell)));
};

const hasMappedProductColumn = (rawRow, mappings) =>
  rowContainsMappedField(rawRow, mappings, 'products', 'product');

const hasMappedTranColumn = (rawRow, mappings) =>
  rowContainsMappedField(rawRow, mappings, 'products', 'tran_no');

const hasMappedTagColumn = (rawRow, mappings) =>
  rowContainsMappedField(rawRow, mappings, 'products', 'tag_packet_no');

export const isProbableHeaderRow = (rawRow, mappings) => {
  if (!Array.isArray(rawRow) || rawRow.length === 0) {
    return false;
  }

  const hasProduct = hasMappedProductColumn(rawRow, mappings);
  const hasTran = hasMappedTranColumn(rawRow, mappings);
  const hasTag = hasMappedTagColumn(rawRow, mappings);

  return hasProduct && (hasTran || hasTag);
};

export const findHeaderRowIndex = (rows, mappings = [], maxScanRows = 300) => {
  const limit = Math.min(rows.length, maxScanRows);

  for (let index = 0; index < limit; index += 1) {
    if (isProbableHeaderRow(rows[index], mappings)) {
      return index;
    }
  }

  return -1;
};

export default {
  buildDynamicColumnMap,
  mapRawRowToProductRecord,
  flattenToLegacyProductRow,
  validateRequiredHeaders,
  findHeaderRowIndex,
  isProbableHeaderRow,
};
