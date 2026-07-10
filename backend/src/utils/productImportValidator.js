import {
  DUPLICATE_TRACKING_FIELDS,
  PRODUCT_IMPORT_TABLES,
} from '../config/productImportColumnMapping.js';
import {
  buildTaggedRowKey,
  buildUntaggedRowKey,
  flattenToLegacyProductRow,
  isDataRowCandidate,
  isGroupHeaderRow,
} from './productImportMapper.js';

const MAX_ERROR_DETAILS = 200;

const isNegativeNumber = (value) =>
  value !== null && value !== undefined && Number(value) < 0;

const isValidDateString = (value) => {
  if (!value) {
    return true;
  }

  const str = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return false;
  }

  const date = new Date(`${str}T00:00:00`);
  return !Number.isNaN(date.getTime());
};

/**
 * @param {Record<string, Record<string, unknown>>} record
 * @param {number} rowNumber
 */
export const validateProductRecord = (record, rowNumber) => {
  const legacy = flattenToLegacyProductRow(record);
  const errors = [];

  if (isGroupHeaderRow(legacy)) {
    return { valid: false, skip: true, reason: 'group_header', errors: [] };
  }

  if (!isDataRowCandidate(legacy)) {
    return { valid: false, skip: true, reason: 'invalid_row', errors: [] };
  }

  if (!String(legacy.product ?? '').trim()) {
    const erpProCode = record.product_master?.erp_pro_code;
    if (erpProCode !== null && erpProCode !== undefined && erpProCode !== '') {
      errors.push({
        row: rowNumber,
        field: 'erp_pro_code',
        message: `Unknown product code: ${erpProCode}`,
      });
    } else {
      errors.push({ row: rowNumber, field: 'product', message: 'Product is required' });
    }
  }

  if (
    !String(legacy.tran_no ?? '').trim() &&
    !String(legacy.tag_packet_no ?? '').trim()
  ) {
    errors.push({
      row: rowNumber,
      field: 'tran_no',
      message: 'Transaction number or tag number is required',
    });
  }

  if (
    String(legacy.tran_no ?? '').trim() &&
    !/^\d+$/.test(String(legacy.tran_no).trim())
  ) {
    errors.push({ row: rowNumber, field: 'tran_no', message: 'Invalid transaction number' });
  }

  if (legacy.tran_date && !isValidDateString(legacy.tran_date)) {
    errors.push({ row: rowNumber, field: 'tran_date', message: 'Invalid transaction date' });
  }

  const weightFields = [
    ['gross_wt', legacy.gross_wt],
    ['net_wt', legacy.net_wt],
    ['weight_gram', legacy.weight_gram],
    ['weight_carat', legacy.weight_carat],
  ];

  for (const [field, value] of weightFields) {
    if (isNegativeNumber(value)) {
      errors.push({ row: rowNumber, field, message: `${field} cannot be negative` });
    }
  }

  const pricing = record[PRODUCT_IMPORT_TABLES.PRICING] ?? {};
  for (const [field, value] of Object.entries(pricing)) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      errors.push({ row: rowNumber, field, message: `Invalid numeric value for ${field}` });
    }
  }

  if (
    legacy.gross_wt !== null &&
    legacy.net_wt !== null &&
    Number(legacy.net_wt) > Number(legacy.gross_wt)
  ) {
    errors.push({
      row: rowNumber,
      field: 'net_wt',
      message: 'Net weight cannot exceed gross weight',
    });
  }

  if (errors.length > 0) {
    return { valid: false, skip: false, reason: 'validation_failed', errors };
  }

  return { valid: true, skip: false, legacy, errors: [] };
};

export const createDuplicateTracker = () => {
  const tagKeys = new Set();
  const barcodeKeys = new Set();
  const untaggedKeys = new Set();

  return {
    check(record, rowNumber) {
      const legacy = flattenToLegacyProductRow(record);
      const errors = [];

      const tagKey = buildTaggedRowKey(legacy);
      if (tagKey) {
        if (tagKeys.has(tagKey)) {
          errors.push({
            row: rowNumber,
            field: 'tag_packet_no',
            message: `Duplicate tag number: ${tagKey}`,
          });
        } else {
          tagKeys.add(tagKey);
        }
      } else {
        const untaggedKey = buildUntaggedRowKey(legacy);
        if (untaggedKeys.has(untaggedKey)) {
          errors.push({
            row: rowNumber,
            field: 'tran_no',
            message: 'Duplicate untagged product line',
          });
        } else {
          untaggedKeys.add(untaggedKey);
        }
      }

      const barcode = String(record[PRODUCT_IMPORT_TABLES.TAG]?.barcode ?? '').trim().toUpperCase();
      if (barcode) {
        if (barcodeKeys.has(barcode)) {
          errors.push({
            row: rowNumber,
            field: 'barcode',
            message: `Duplicate barcode: ${barcode}`,
          });
        } else {
          barcodeKeys.add(barcode);
        }
      }

      return errors;
    },
  };
};

export const createImportSummary = () => ({
  totalRecords: 0,
  importedRecords: 0,
  updatedRecords: 0,
  duplicateRecords: 0,
  failedRecords: 0,
  skipped: 0,
  taggedRows: 0,
  untaggedRows: 0,
  errors: [],
});

export const appendImportError = (summary, error) => {
  summary.failedRecords += 1;

  if (summary.errors.length < MAX_ERROR_DETAILS) {
    summary.errors.push(error);
  }
};

export const countRowTypes = (legacyRow) => {
  if (String(legacyRow.tag_packet_no ?? '').trim()) {
    return 'tagged';
  }

  return 'untagged';
};

export { DUPLICATE_TRACKING_FIELDS, MAX_ERROR_DETAILS };
