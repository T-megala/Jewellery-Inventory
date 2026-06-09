import pool from '../config/database.js';
import { getActiveBatchId } from './productBatchService.js';

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
    return [];
  }

  const [rows] = await pool.execute(
    `SELECT DISTINCT product
     FROM products
     WHERE product IS NOT NULL AND TRIM(product) != ''
     ${batchFilter.clause}
     ORDER BY product ASC`,
    batchFilter.params
  );

  return mapRowsToNamedList(rows, 'product');
};

const getSubProducts = async (productName) => {
  const batchFilter = await activeBatchFilter();

  if (!batchFilter) {
    return [];
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

  return mapRowsToNamedList(rows, 'sub_product');
};

const getCenters = async (productName, subProductName) => {
  const batchFilter = await activeBatchFilter();

  if (!batchFilter) {
    return [];
  }

  const [rows] = await pool.execute(
    `SELECT DISTINCT counter_name
     FROM products
     WHERE product = ?
       AND sub_product = ?
       AND counter_name IS NOT NULL
       AND TRIM(counter_name) != ''
       ${batchFilter.clause}
     ORDER BY counter_name ASC`,
    [productName, subProductName, ...batchFilter.params]
  );

  return mapRowsToNamedList(rows, 'counter_name');
};

export default {
  getProducts,
  getSubProducts,
  getCenters,
};
