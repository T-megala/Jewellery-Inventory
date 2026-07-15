import {
  PRODUCT_IMPORT_TABLES,
} from '../config/productImportColumnMapping.js';

const TABLE_COLUMNS = {
  [PRODUCT_IMPORT_TABLES.MASTER]: [
    'category', 'product_design', 'collection_name', 'brand', 'gender', 'occasion',
    'metal', 'purity', 'hsn_code', 'uom', 'product_code', 'erp_pro_code', 'description', 'remarks',
    'certification_number', 'hallmark_number', 'image_url',
  ],
  [PRODUCT_IMPORT_TABLES.INVENTORY]: [
    'company', 'branch_name', 'warehouse', 'location', 'stock_status', 'lot_number',
    'supplier', 'supplier_invoice_number', 'purchase_date',
  ],
  [PRODUCT_IMPORT_TABLES.PRICING]: [
    'gold_rate', 'making_charge', 'making_charge_type', 'wastage_percentage',
    'wastage_amount', 'stone_amount', 'diamond_amount', 'labour_charge',
    'purchase_cost', 'selling_price', 'gst_percentage', 'gst_amount',
    'less_weight', 'thread_weight', 'supplier_deduction_weight', 'stone_weight',
    'diamond_weight', 'other_metal_weight', 'diamond_pieces',
    'sale_value', 'rate', 'rate_id', 'per_pcs_value', 'per_gram_value', 'max_mc',
  ],
  [PRODUCT_IMPORT_TABLES.TAG]: [
    'tag_no', 'barcode', 'rfid', 'qr_code',
  ],
};

const hasTableData = (table, data) => {
  const columns = TABLE_COLUMNS[table] ?? [];
  return columns.some((column) => data[column] !== undefined && data[column] !== null);
};

const buildInsertValues = (table, productIds, records) => {
  const columns = ['product_id', ...TABLE_COLUMNS[table]];
  const values = [];

  for (let index = 0; index < productIds.length; index += 1) {
    const productId = productIds[index];
    const data = records[index]?.[table] ?? {};

    if (!hasTableData(table, data)) {
      continue;
    }

    values.push([
      productId,
      ...TABLE_COLUMNS[table].map((column) => data[column] ?? null),
    ]);
  }

  return { columns, values };
};

const bulkInsertNormalizedTable = async (connection, table, productIds, records) => {
  const { columns, values } = buildInsertValues(table, productIds, records);

  if (values.length === 0) {
    return 0;
  }

  await connection.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES ?`,
    [values],
  );

  return values.length;
};

export const bulkInsertNormalizedDetails = async (connection, productIds, records) => {
  const tables = [
    PRODUCT_IMPORT_TABLES.MASTER,
    PRODUCT_IMPORT_TABLES.INVENTORY,
    PRODUCT_IMPORT_TABLES.PRICING,
    PRODUCT_IMPORT_TABLES.TAG,
  ];

  let inserted = 0;

  for (const table of tables) {
    inserted += await bulkInsertNormalizedTable(connection, table, productIds, records);
  }

  return inserted;
};

const bulkUpsertNormalizedTable = async (connection, table, productIds, records) => {
  const columns = ['product_id', ...TABLE_COLUMNS[table]];
  const rows = [];

  for (let index = 0; index < productIds.length; index += 1) {
    const productId = productIds[index];
    const data = records[index]?.[table] ?? {};

    if (!hasTableData(table, data)) {
      continue;
    }

    rows.push([
      productId,
      ...TABLE_COLUMNS[table].map((column) => data[column] ?? null),
    ]);
  }

  if (rows.length === 0) {
    return 0;
  }

  const assignments = TABLE_COLUMNS[table]
    .map((column) => `${column} = VALUES(${column})`)
    .join(', ');

  await connection.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES ?
     ON DUPLICATE KEY UPDATE ${assignments}, updated_at = CURRENT_TIMESTAMP`,
    [rows],
  );

  return rows.length;
};

export const bulkUpsertNormalizedDetails = async (connection, productIds, records) => {
  const tables = [
    PRODUCT_IMPORT_TABLES.MASTER,
    PRODUCT_IMPORT_TABLES.INVENTORY,
    PRODUCT_IMPORT_TABLES.PRICING,
    PRODUCT_IMPORT_TABLES.TAG,
  ];

  let affected = 0;

  for (const table of tables) {
    affected += await bulkUpsertNormalizedTable(connection, table, productIds, records);
  }

  return affected;
};

export const deleteNormalizedDetails = async (connection, productIds) => {
  if (!productIds.length) {
    return;
  }

  const placeholders = productIds.map(() => '?').join(', ');
  const tables = [
    PRODUCT_IMPORT_TABLES.TAG,
    PRODUCT_IMPORT_TABLES.PRICING,
    PRODUCT_IMPORT_TABLES.INVENTORY,
    PRODUCT_IMPORT_TABLES.MASTER,
  ];

  for (const table of tables) {
    await connection.query(
      `DELETE FROM ${table} WHERE product_id IN (${placeholders})`,
      productIds,
    );
  }
};

export default {
  bulkInsertNormalizedDetails,
  bulkUpsertNormalizedDetails,
  deleteNormalizedDetails,
};
