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

const getProducts = async () => {
  const batchFilter = await activeBatchFilter();

  if (!batchFilter) {
    return [{ id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_PRODUCTS }];
  }

  const [rows] = await pool.execute(
    `SELECT DISTINCT product
     FROM products
     WHERE product IS NOT NULL AND TRIM(product) != ''
     ${batchFilter.clause}
     ORDER BY product ASC`,
    batchFilter.params
  );

  return [
    { id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_PRODUCTS },
    ...mapRowsToNamedList(rows, 'product'),
  ];
};

const getSubProducts = async (productName) => {
  if (isAllProductsByName(productName)) {
    return [{ id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_SUB_PRODUCTS }];
  }

  const batchFilter = await activeBatchFilter();

  if (!batchFilter) {
    return [{ id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_SUB_PRODUCTS }];
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

  return [
    { id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_SUB_PRODUCTS },
    ...mapRowsToNamedList(rows, 'sub_product'),
  ];
};

const getCenters = async (productName, subProductName) => {
  if (isAllProductsByName(productName)) {
    return [{ id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_CENTERS }];
  }

  const batchFilter = await activeBatchFilter();

  if (!batchFilter) {
    return [{ id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_CENTERS }];
  }

  const params = [productName, ...batchFilter.params];
  let subProductClause = 'AND sub_product = ?';

  if (isAllSubProductsByName(subProductName)) {
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

  return [
    { id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_CENTERS },
    ...mapRowsToNamedList(rows, 'counter_name'),
  ];
};

export default {
  getProducts,
  getSubProducts,
  getCenters,
};
