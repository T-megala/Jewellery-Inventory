import pool from '../config/database.js';
import { getActiveBatchId } from './productBatchService.js';
import {
  ALL_SCOPE_ID,
  SCOPE_NAMES,
  isAllProductsByName,
  isAllSubProductsByName,
} from '../utils/verificationScope.js';
import {
  activeBranchProductsJoin,
  activeBranchProductsWhere,
  buildBranchSqlFilter,
  normalizeBranchIds,
} from '../utils/branchScope.js';

const mapRowsToNamedList = (rows, column) =>
  rows.map((row, index) => ({
    id: index + 1,
    name: row[column],
  }));

const buildInventoryScope = async ({ branchId = null, branchIds = null } = {}) => {
  const scope = normalizeBranchIds({ branchId, branchIds });

  if (scope.length === 0) {
    return null;
  }

  if (scope.length === 1) {
    const batchId = await getActiveBatchId(scope[0]);
    return batchId
      ? {
          from: 'FROM products p',
          clause: 'AND p.batch_id = ?',
          params: [batchId],
        }
      : null;
  }

  const branchFilter = buildBranchSqlFilter('pub.branch_id', scope);

  return {
    from: activeBranchProductsJoin('pub'),
    clause: `${branchFilter.clause}`,
    params: branchFilter.params,
  };
};

const getProducts = async ({
  branchId = null,
  branchIds = null,
  includeAllProductsOption = true,
} = {}) => {
  const scope = await buildInventoryScope({ branchId, branchIds });

  if (!scope) {
    return includeAllProductsOption
      ? [{ id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_PRODUCTS }]
      : [];
  }

  const [rows] = await pool.execute(
    `SELECT DISTINCT p.product
     ${scope.from}
     WHERE ${activeBranchProductsWhere}
     ${scope.clause}
     ORDER BY p.product ASC`,
    scope.params,
  );

  const products = mapRowsToNamedList(rows, 'product');

  if (!includeAllProductsOption) {
    return products;
  }

  return [{ id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_PRODUCTS }, ...products];
};

const getSubProducts = async (
  productName,
  { branchId = null, branchIds = null, includeAllSubProductsOption = true } = {},
) => {
  if (isAllProductsByName(productName)) {
    return includeAllSubProductsOption
      ? [{ id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_SUB_PRODUCTS }]
      : [];
  }

  const scope = await buildInventoryScope({ branchId, branchIds });

  if (!scope) {
    return includeAllSubProductsOption
      ? [{ id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_SUB_PRODUCTS }]
      : [];
  }

  const [rows] = await pool.execute(
    `SELECT DISTINCT p.sub_product
     ${scope.from}
     WHERE p.product = ?
       AND p.sub_product IS NOT NULL
       AND TRIM(p.sub_product) != ''
       ${scope.clause}
     ORDER BY p.sub_product ASC`,
    [productName, ...scope.params],
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
  { branchId = null, branchIds = null, includeAllCentersOption = true } = {},
) => {
  if (isAllProductsByName(productName)) {
    return includeAllCentersOption
      ? [{ id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_CENTERS }]
      : [];
  }

  const scope = await buildInventoryScope({ branchId, branchIds });

  if (!scope) {
    return includeAllCentersOption
      ? [{ id: ALL_SCOPE_ID, name: SCOPE_NAMES.ALL_CENTERS }]
      : [];
  }

  const params = [productName, ...scope.params];
  let subProductClause = 'AND p.sub_product = ?';

  if (isAllSubProductsByName(subProductName)) {
    if (!includeAllCentersOption) {
      return [];
    }

    subProductClause = '';
  } else {
    params.splice(1, 0, subProductName);
  }

  const [rows] = await pool.execute(
    `SELECT DISTINCT p.counter_name
     ${scope.from}
     WHERE p.product = ?
       ${subProductClause}
       AND p.counter_name IS NOT NULL
       AND TRIM(p.counter_name) != ''
       ${scope.clause}
     ORDER BY p.counter_name ASC`,
    params,
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
