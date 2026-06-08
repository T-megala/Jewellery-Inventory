import pool from '../config/database.js';

const mapRowsToNamedList = (rows, column) =>
  rows.map((row, index) => ({
    id: index + 1,
    name: row[column],
  }));

const getProducts = async () => {
  const [rows] = await pool.execute(
    `SELECT DISTINCT product
     FROM products
     WHERE product IS NOT NULL AND TRIM(product) != ''
     ORDER BY product ASC`
  );

  return mapRowsToNamedList(rows, 'product');
};

const getSubProducts = async (productName) => {
  const [rows] = await pool.execute(
    `SELECT DISTINCT sub_product
     FROM products
     WHERE product = ?
       AND sub_product IS NOT NULL
       AND TRIM(sub_product) != ''
     ORDER BY sub_product ASC`,
    [productName]
  );

  return mapRowsToNamedList(rows, 'sub_product');
};

const getCenters = async (productName, subProductName) => {
  const [rows] = await pool.execute(
    `SELECT DISTINCT counter_name
     FROM products
     WHERE product = ?
       AND sub_product = ?
       AND counter_name IS NOT NULL
       AND TRIM(counter_name) != ''
     ORDER BY counter_name ASC`,
    [productName, subProductName]
  );

  return mapRowsToNamedList(rows, 'counter_name');
};

export default {
  getProducts,
  getSubProducts,
  getCenters,
};
