import pool from '../config/database.js';
import { getActiveBatchId } from './productBatchService.js';
import {
  ALL_SCOPE_ID,
  SCOPE_NAMES,
  isAllProductsByName,
  isAllSubProductsByName,
} from '../utils/verificationScope.js';

const mapRowsToNamedList = (rows, column) =>
  rows.map((row, index) => ({
    id: index + 1,
    name: row[column],
  }));

const activeBatchFilter = async () => {
  const batchId = await getActiveBatchId();
  return batchId ? { clause: 'AND batch_id = ?', params: [batchId] } : null;
};

const getProducts = async ({ includeAllProductsOption = true } = {}) => {
  const batchFilter = await activeBatchFilter();

  if (!batchFilter) {
    return includeAllProductsOption
      ? [{ id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_PRODUCTS }]
      : [];
  }

  const [rows] = await pool.execute(
    `SELECT DISTINCT product
     FROM products
     WHERE product IS NOT NULL AND TRIM(product) != ''
     ${batchFilter.clause}
     ORDER BY product ASC`,
    batchFilter.params
  );

  const products = mapRowsToNamedList(rows, 'product');

  if (!includeAllProductsOption) {
    return products;
  }

  return [{ id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_PRODUCTS }, ...products];
};

const getSubProducts = async (
  productName,
  { includeAllSubProductsOption = true } = {},
) => {
  if (isAllProductsByName(productName)) {
    return includeAllSubProductsOption
      ? [{ id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_SUB_PRODUCTS }]
      : [];
  }

  const batchFilter = await activeBatchFilter();

  if (!batchFilter) {
    return includeAllSubProductsOption
      ? [{ id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_SUB_PRODUCTS }]
      : [];
  }

  const [rows] = await pool.execute(
    `SELECT DISTINCT sub_product
     FROM products
     WHERE product = ?
       AND sub_product IS NOT NULL
       AND TRIM(sub_product) != ''
       ${batchFilter.clause}
     ORDER BY sub_product ASC`,
    [productName, ...batchFilter.params]
  );

  const subProducts = mapRowsToNamedList(rows, 'sub_product');

  if (!includeAllSubProductsOption) {
    return subProducts;
  }

  return [
    { id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_SUB_PRODUCTS },
    ...subProducts,
  ];
};

const getCenters = async (
  productName,
  subProductName,
  { includeAllCentersOption = true } = {},
) => {
  if (isAllProductsByName(productName)) {
    return includeAllCentersOption
      ? [{ id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_CENTERS }]
      : [];
  }

  const batchFilter = await activeBatchFilter();

  if (!batchFilter) {
    return includeAllCentersOption
      ? [{ id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_CENTERS }]
      : [];
  }

  const params = [productName, ...batchFilter.params];
  let subProductClause = 'AND sub_product = ?';

  if (isAllSubProductsByName(subProductName)) {
    if (!includeAllCentersOption) {
      return [];
    }

    subProductClause = '';
  } else {
    params.splice(1, 0, subProductName);
  }

  const [rows] = await pool.execute(
    `SELECT DISTINCT counter_name
     FROM products
     WHERE product = ?
       ${subProductClause}
       AND counter_name IS NOT NULL
       AND TRIM(counter_name) != ''
       ${batchFilter.clause}
     ORDER BY counter_name ASC`,
    params
  );

  const centers = mapRowsToNamedList(rows, 'counter_name');

  if (!includeAllCentersOption) {
    return centers;
  }

  return [{ id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_CENTERS }, ...centers];
};

export default {
  getProducts,
  getSubProducts,
  getCenters,
};
