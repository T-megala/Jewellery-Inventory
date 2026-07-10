import ExcelJS from 'exceljs';
import pool from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import { normalizeHeader } from '../utils/productImportMapper.js';

const PRO_CODE_HEADERS = new Set([
  'procode',
  'productcodeid',
  'productcode',
  'code',
]);

const PRODUCT_NAME_HEADERS = new Set([
  'product',
  'productname',
  'name',
  'itemname',
]);

const formatRow = (row) => ({
  proCode: Number(row.pro_code),
  productName: row.product_name,
  isActive: Boolean(row.is_active),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const findCatalogHeaderRow = (sheet) => {
  const maxScan = Math.min(sheet.rowCount || 0, 20);

  for (let rowIndex = 1; rowIndex <= maxScan; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    let proCodeCol = null;
    let productCol = null;

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = normalizeHeader(cell.value);
      if (!key) {
        return;
      }

      if (PRO_CODE_HEADERS.has(key)) {
        proCodeCol = colNumber;
      }

      if (PRODUCT_NAME_HEADERS.has(key) && productCol === null) {
        productCol = colNumber;
      }
    });

    if (proCodeCol && productCol) {
      return { rowIndex, proCodeCol, productCol };
    }
  }

  return null;
};

const cellToValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object' && value.result !== undefined) {
    return value.result;
  }

  if (typeof value === 'object' && value.text !== undefined) {
    return value.text;
  }

  return value;
};

const parseCatalogExcel = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new ApiError(400, 'Excel file has no worksheets');
  }

  const header = findCatalogHeaderRow(sheet);
  if (!header) {
    throw new ApiError(400, 'Header row with ProCode and Product columns was not found');
  }

  const rows = [];

  for (let rowIndex = header.rowIndex + 1; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    const proCodeRaw = cellToValue(row.getCell(header.proCodeCol).value);
    const productName = String(cellToValue(row.getCell(header.productCol).value) ?? '').trim();

    if (proCodeRaw === '' || proCodeRaw === null || proCodeRaw === undefined) {
      continue;
    }

    const proCode = Number(proCodeRaw);
    if (!Number.isInteger(proCode) || proCode <= 0) {
      continue;
    }

    if (!productName) {
      continue;
    }

    rows.push({ proCode, productName });
  }

  if (rows.length === 0) {
    throw new ApiError(400, 'No valid ProCode / Product rows found in file');
  }

  return rows;
};

const mergeProductCodes = async (inputRows) => {
  const rows = inputRows
    .map((row) => ({
      proCode: Number(row.proCode ?? row.pro_code),
      productName: String(row.productName ?? row.product_name ?? '').trim(),
      isActive: row.isActive ?? row.is_active ?? true,
    }))
    .filter((row) => Number.isInteger(row.proCode) && row.proCode > 0 && row.productName);

  if (rows.length === 0) {
    throw new ApiError(400, 'At least one valid proCode and productName is required');
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const [result] = await connection.query(
        `INSERT INTO erp_product_codes (pro_code, product_name, is_active)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           product_name = VALUES(product_name),
           is_active = VALUES(is_active),
           updated_at = CURRENT_TIMESTAMP`,
        [row.proCode, row.productName, row.isActive ? 1 : 0],
      );

      if (Number(result.affectedRows) === 1) {
        inserted += 1;
      } else {
        updated += 1;
      }
    }

    await connection.commit();

    return {
      total: rows.length,
      inserted,
      updated,
      unchanged: Math.max(0, rows.length - inserted - updated),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const listProductCodes = async ({ includeInactive = false } = {}) => {
  const [rows] = await pool.query(
    `SELECT pro_code, product_name, is_active, created_at, updated_at
     FROM erp_product_codes
     ${includeInactive ? '' : 'WHERE is_active = 1'}
     ORDER BY pro_code ASC`,
  );

  return rows.map(formatRow);
};

const getProductCode = async (proCode) => {
  const code = Number(proCode);
  if (!Number.isInteger(code) || code <= 0) {
    throw new ApiError(400, 'Invalid product code');
  }

  const [rows] = await pool.query(
    `SELECT pro_code, product_name, is_active, created_at, updated_at
     FROM erp_product_codes
     WHERE pro_code = ?
     LIMIT 1`,
    [code],
  );

  if (!rows.length) {
    throw new ApiError(404, 'Product code not found');
  }

  return formatRow(rows[0]);
};

const buildLookupMap = async () => {
  const [rows] = await pool.query(
    `SELECT pro_code, product_name
     FROM erp_product_codes
     WHERE is_active = 1`,
  );

  const lookup = new Map();
  for (const row of rows) {
    lookup.set(Number(row.pro_code), String(row.product_name).trim());
  }

  return lookup;
};

const buildProductNameToCodeMap = async () => {
  try {
    const [rows] = await pool.query(
      `SELECT pro_code, product_name
       FROM erp_product_codes
       WHERE is_active = 1`,
    );

    const lookup = new Map();
    for (const row of rows) {
      const name = String(row.product_name).trim().toUpperCase();
      if (name) {
        lookup.set(name, Number(row.pro_code));
      }
    }

    return lookup;
  } catch {
    return new Map();
  }
};

const resolveProductName = (proCode, lookup) => {
  const code = Number(proCode);
  if (!Number.isInteger(code) || code <= 0 || !lookup) {
    return null;
  }

  return lookup.get(code) ?? null;
};

const importProductCodesFromExcel = async (buffer) => {
  const rows = await parseCatalogExcel(buffer);
  return mergeProductCodes(rows);
};

export default {
  listProductCodes,
  getProductCode,
  mergeProductCodes,
  importProductCodesFromExcel,
  buildLookupMap,
  buildProductNameToCodeMap,
  resolveProductName,
  parseCatalogExcel,
};
