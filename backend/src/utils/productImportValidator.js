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
const MAX_SKIP_DETAILS = 200;

export const SKIP_REASONS = {
  GROUP_HEADER: 'group_header',
  INVALID_ROW: 'invalid_row',
  NO_MATCH_IDENTIFIER: 'no_match_identifier',
  NOT_FOUND_IN_BATCH: 'not_found_in_batch',
};

const buildRowContext = (legacy, record = null) => ({
  product: String(legacy?.product ?? '').trim() || null,
  subProduct: String(legacy?.sub_product ?? '').trim() || null,
  tranNo: String(legacy?.tran_no ?? '').trim() || null,
  tag: String(legacy?.tag_packet_no ?? '').trim() || null,
  barcode: String(record?.[PRODUCT_IMPORT_TABLES.TAG]?.barcode ?? '').trim() || null,
});

const describeInvalidRowSkip = (legacy) => {
  const product = String(legacy.product ?? '').trim();
  const tranNo = String(legacy.tran_no ?? '').trim();

  if (!product) {
    return 'Row is empty or missing product name';
  }

  if (tranNo && !/^\d+$/.test(tranNo)) {
    return `Invalid transaction number "${tranNo}" (must be numeric)`;
  }

  return 'Row does not contain importable product data';
};

const describeGroupHeaderSkip = (legacy) => {
  const product = String(legacy.product ?? '').trim();
  return `Category or section header row "${product}" (no transaction or tag number)`;
};

/**
 * Lightweight validation: product + tag/tran only.
 * Weights, dates, and pricing are stored as mapped without extra checks.
 *
 * @param {Record<string, Record<string, unknown>>} record
 * @param {number} rowNumber
 */
export const validateProductRecord = (record, rowNumber) => {
  const legacy = flattenToLegacyProductRow(record);
  const errors = [];

  if (isGroupHeaderRow(legacy)) {
    return {
      valid: false,
      skip: true,
      reason: SKIP_REASONS.GROUP_HEADER,
      message: describeGroupHeaderSkip(legacy),
      errors: [],
    };
  }

  if (!isDataRowCandidate(legacy)) {
    return {
      valid: false,
      skip: true,
      reason: SKIP_REASONS.INVALID_ROW,
      message: describeInvalidRowSkip(legacy),
      errors: [],
    };
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
  skippedRows: [],
  taggedRows: 0,
  untaggedRows: 0,
  errors: [],
});

export const appendImportSkip = (summary, entry) => {
  summary.skipped += 1;

  if (summary.skippedRows.length < MAX_SKIP_DETAILS) {
    summary.skippedRows.push(entry);
  }
};

export const buildImportSkipEntry = ({
  rowNumber,
  reason,
  message,
  legacy = null,
  record = null,
}) => ({
  row: rowNumber,
  reason,
  message,
  ...buildRowContext(legacy ?? {}, record),
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

export { DUPLICATE_TRACKING_FIELDS, MAX_ERROR_DETAILS, MAX_SKIP_DETAILS };
