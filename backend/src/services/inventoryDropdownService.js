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
    `SELECT DISTINCT item_description
     FROM products
     WHERE item_description IS NOT NULL AND TRIM(item_description) != ''
     ${batchFilter.clause}
     ORDER BY item_description ASC`,
    batchFilter.params,
  );

  return mapRowsToNamedList(rows, 'item_description');
};

const getSubProducts = async () => [];

const getCenters = async () => [];

export default {
  getProducts,
  getSubProducts,
  getCenters,
};
