import pool from "../config/database.js";
import { getActiveBatchIdsForBranches } from "./productBatchService.js";
import inventoryDropdownService from "./inventoryDropdownService.js";
import { batchAllProductsWhere } from "../utils/productQueryHelper.js";
import { formatCalendarDate } from "../utils/productBatchHelper.js";
import erpProductCodeService from "./erpProductCodeService.js";
import {
  activeBranchProductsJoin,
  activeBranchProductsWhere,
  buildBranchSqlFilter,
  normalizeBranchIds,
} from "../utils/branchScope.js";

const formatDateTime = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatDate = (value) => formatCalendarDate(value);

const mapProductRow = (row) => ({
  id: row.id,
  batchId: row.batch_id,
  branchId: row.branch_id ? Number(row.branch_id) : null,
  branchName: row.branch_name ?? null,
  tranNo: row.tran_no,
  tranDate: formatDate(row.tran_date),
  product: row.product,
  subProduct: row.sub_product,
  tagPacketNo: row.tag_packet_no,
  pieces: row.pieces,
  grossWt: row.gross_wt,
  netWt: row.net_wt,
  counterName: row.counter_name,
  size: row.size,
  tagType: row.tag_type,
  itemPieces: row.item_pieces,
  weightGram: row.weight_gram,
  weightCarat: row.weight_carat,
  createdAt: formatDateTime(row.created_at),
});

const buildSearchClause = (search) => {
  if (!search) {
    return { clause: "", params: [] };
  }

  const term = `%${search}%`;

  return {
    clause: `AND (
      p.product LIKE ?
      OR p.sub_product LIKE ?
      OR p.tag_packet_no LIKE ?
      OR p.counter_name LIKE ?
      OR CAST(p.tran_no AS CHAR) LIKE ?
      OR p.size LIKE ?
      OR p.tag_type LIKE ?
    )`,
    params: [term, term, term, term, term, term, term],
  };
};

const buildProductListQuery = ({ search, batchId = null, branchIds = [] }) => {
  const { clause: searchClause, params: searchParams } =
    buildSearchClause(search);

  if (batchId) {
    return {
      baseFrom: `
        FROM products p
        INNER JOIN product_upload_batches pub ON pub.id = p.batch_id
        LEFT JOIN branches b ON b.id = pub.branch_id
        WHERE ${batchAllProductsWhere.replace("batch_id = ?", "p.batch_id = ?")}
        ${searchClause}
      `,
      params: [batchId, ...searchParams],
      batchId,
    };
  }

  const scope = normalizeBranchIds({ branchIds });

  if (scope.length === 0) {
    return null;
  }

  const branchFilter = buildBranchSqlFilter("pub.branch_id", scope);

  return {
    baseFrom: `
      ${activeBranchProductsJoin("pub")}
      LEFT JOIN branches b ON b.id = pub.branch_id
      WHERE ${activeBranchProductsWhere}
      ${branchFilter.clause}
      ${searchClause}
    `,
    params: [...branchFilter.params, ...searchParams],
    batchId: null,
  };
};

const getProductList = async ({
  search,
  page,
  limit,
  offset,
  batchId = null,
  branchIds = [],
}) => {
  const query = buildProductListQuery({ search, batchId, branchIds });

  if (!query) {
    return {
      pagination: { page, limit, totalRecords: 0, totalPages: 0 },
      data: [],
      batchId: null,
      branchIds: [],
    };
  }

  const { baseFrom, params } = query;
  const scope = normalizeBranchIds({ branchIds });

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS totalRecords ${baseFrom}`,
    params,
  );

  const totalRecords = Number(countRows[0].totalRecords);
  const totalPages = totalRecords === 0 ? 0 : Math.ceil(totalRecords / limit);

  const [rows] = await pool.execute(
    `SELECT
       p.id, p.batch_id, pub.branch_id, b.name AS branch_name,
       p.tran_no, p.tran_date, p.product, p.sub_product, p.tag_packet_no,
       p.pieces, p.gross_wt, p.net_wt, p.counter_name, p.size, p.tag_type,
       p.item_pieces, p.weight_gram, p.weight_carat, p.created_at
     ${baseFrom}
     ORDER BY p.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  let resolvedBatchId = batchId;

  if (!resolvedBatchId && scope.length === 1) {
    resolvedBatchId = await getActiveBatchId(scope[0]);
  }

  return {
    batchId: resolvedBatchId,
    branchIds: scope,
    pagination: { page, limit, totalRecords, totalPages },
    data: rows.map(mapProductRow),
  };
};

export const getProducts = (options = {}) =>
  inventoryDropdownService.getProducts(options);

export const getProductsForBranch = (branchIds) =>
  inventoryDropdownService.getProducts({ branchIds });

export const getSubProducts = (product, branchIds = []) =>
  inventoryDropdownService.getSubProducts(product, { branchIds });

export const getCenters = (product, subProduct, branchIds = []) =>
  inventoryDropdownService.getCenters(product, subProduct, { branchIds });

const toNumber = (value) => (value != null && value !== "" ? Number(value) : null);

const mapPrintDetailRow = (row, { branchName = null, productNameToProCode = null } = {}) => {
  const grossWt = toNumber(row.gross_wt);
  const netWt = toNumber(row.net_wt);
  const tagNo = row.tag_packet_no ?? null;
  const productName = row.product ?? null;
  const resolvedProCode = row.erp_pro_code != null
    ? Number(row.erp_pro_code)
    : (productName && productNameToProCode
      ? productNameToProCode.get(String(productName).trim().toUpperCase()) ?? null
      : null);

  return {
    productName,
    subProductName: row.sub_product ?? null,
    tagNo,
    grossWt,
    netWt,
    weightGram: toNumber(row.weight_gram),
    weightCarat: toNumber(row.weight_carat),
    pieces: toNumber(row.pieces),
    counterName: row.counter_name ?? null,
    proCode: resolvedProCode,
    purity: row.purity ?? null,
    metal: row.metal ?? null,
    grossWeight: grossWt,
    netWeight: netWt,
    wastagePercentage: toNumber(row.wastage_percentage),
    makingCharge: toNumber(row.making_charge),
    goldRate: toNumber(row.gold_rate),
    amount: toNumber(row.selling_price),
    branchName: branchName ?? row.branch_name ?? null,
    qrCode: row.qr_code ?? tagNo,
  };
};

const PRINT_DETAILS_EXTENSION_JOINS = `
  LEFT JOIN product_master pm ON pm.product_id = p.id
  LEFT JOIN product_pricing pp ON pp.product_id = p.id
  LEFT JOIN product_tag_details ptd ON ptd.product_id = p.id
`;

const PRINT_DETAILS_BASE_SELECT = `
  p.product,
  p.sub_product,
  p.tag_packet_no,
  p.gross_wt,
  p.net_wt,
  p.weight_gram,
  p.weight_carat,
  p.pieces,
  p.counter_name
`;

const PRINT_DETAILS_EXTENDED_SELECT = `
  ${PRINT_DETAILS_BASE_SELECT},
  pm.erp_pro_code,
  pm.purity,
  pm.metal,
  pp.wastage_percentage,
  pp.making_charge,
  pp.gold_rate,
  pp.selling_price,
  ptd.qr_code
`;

const TAGGED_PRODUCT_FILTER = `
  p.tag_packet_no IS NOT NULL
  AND p.tag_packet_no <> ''
`;

const loadBranchNames = async (branchIds) => {
  if (!branchIds.length) {
    return new Map();
  }

  const placeholders = branchIds.map(() => "?").join(", ");
  const [rows] = await pool.query(
    `SELECT id, name FROM branches WHERE id IN (${placeholders})`,
    branchIds,
  );

  return new Map(rows.map((row) => [Number(row.id), row.name]));
};

const getPrintDetails = async ({
  tagNo = null,
  branchIds = [],
  page = null,
  limit = null,
  extended = false,
} = {}) => {
  const scope = normalizeBranchIds({ branchIds });

  if (scope.length === 0) {
    return { items: [], pagination: null };
  }

  const batchIds = await getActiveBatchIdsForBranches(scope);
  if (batchIds.length === 0) {
    return { items: [], pagination: null };
  }

  const branchName = scope.length === 1
    ? (await loadBranchNames(scope)).get(scope[0]) ?? null
    : null;

  const batchPlaceholders = batchIds.map(() => "?").join(", ");
  const normalizedTag = String(tagNo ?? "").trim();
  const includeExtended = Boolean(extended) || Boolean(normalizedTag);

  let productNameToProCode = null;
  if (includeExtended) {
    productNameToProCode = await erpProductCodeService.buildProductNameToCodeMap();
  }

  const mapOptions = { branchName, productNameToProCode };

  if (normalizedTag) {
    const tagParams = [...batchIds, normalizedTag, normalizedTag.toUpperCase()];
    const [rows] = await pool.execute(
      `SELECT
         ${PRINT_DETAILS_EXTENDED_SELECT}
       FROM products p
       ${PRINT_DETAILS_EXTENSION_JOINS}
       WHERE p.batch_id IN (${batchPlaceholders})
         AND ${TAGGED_PRODUCT_FILTER}
         AND (p.tag_packet_no = ? OR UPPER(TRIM(p.tag_packet_no)) = ?)
       ORDER BY p.id DESC
       LIMIT 1`,
      tagParams,
    );

    return {
      items: rows.length ? [mapPrintDetailRow(rows[0], mapOptions)] : [],
      pagination: null,
    };
  }

  const parsedLimit = Number(limit);
  const parsedPage = Number(page);
  const usePagination = Number.isInteger(parsedLimit) && parsedLimit > 0
    && Number.isInteger(parsedPage) && parsedPage > 0;
  const safeLimit = usePagination ? Math.min(parsedLimit, 10000) : null;
  const offset = usePagination ? (parsedPage - 1) * safeLimit : 0;

  let totalRecords = null;
  if (usePagination) {
    const [[countRow]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM products p
       WHERE p.batch_id IN (${batchPlaceholders})
         AND ${TAGGED_PRODUCT_FILTER}`,
      batchIds,
    );
    totalRecords = Number(countRow.total ?? 0);
  }

  const listParams = [...batchIds];
  let limitClause = "";

  if (usePagination) {
    limitClause = "LIMIT ? OFFSET ?";
    listParams.push(safeLimit, offset);
  }

  const selectClause = includeExtended
    ? PRINT_DETAILS_EXTENDED_SELECT
    : PRINT_DETAILS_BASE_SELECT;
  const joinClause = includeExtended ? PRINT_DETAILS_EXTENSION_JOINS : "";

  const [rows] = await pool.execute(
    `SELECT
       ${selectClause}
     FROM products p
     ${joinClause}
     WHERE p.batch_id IN (${batchPlaceholders})
       AND ${TAGGED_PRODUCT_FILTER}
     ${limitClause}`,
    listParams,
  );

  return {
    items: rows.map((row) => mapPrintDetailRow(row, mapOptions)),
    pagination: usePagination
      ? {
          page: parsedPage,
          limit: safeLimit,
          totalRecords,
          totalPages: Math.ceil(totalRecords / safeLimit),
        }
      : null,
  };
};

export { getProductList, getPrintDetails };

export default {
  getProducts,
  getProductsForBranch,
  getSubProducts,
  getCenters,
  getProductList,
  getPrintDetails,
};
