import ExcelJS from "exceljs";
import pool from "../config/database.js";
import {
  getActiveBatchId,
  getActiveBatchIdsForBranches,
} from "./productBatchService.js";
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

const STOCK_EXCEL_COLUMNS = [
  { header: "S.No", key: "sno", width: 8 },
  { header: "Pro Code", key: "proCode", width: 12 },
  { header: "Product", key: "product", width: 28 },
  { header: "Tag No", key: "tagPacketNo", width: 16 },
  { header: "Gross Wt", key: "grossWeight", width: 12 },
  { header: "Net Wt", key: "netWeight", width: 12 },
  { header: "Less Wt", key: "lessWt", width: 12 },
  { header: "Wastage", key: "wastagePercentage", width: 12 },
  { header: "Making Charge", key: "makingCharge", width: 14 },
  { header: "Tran No", key: "tranNo", width: 12 },
  { header: "Tran Date", key: "tranDate", width: 14 },
  { header: "Branch", key: "branchName", width: 16 },
  { header: "Sub Product", key: "subProduct", width: 22 },
  { header: "Pieces", key: "pieces", width: 10 },
  { header: "Counter", key: "counterName", width: 18 },
  { header: "Size", key: "size", width: 10 },
  { header: "Tag Type", key: "tagType", width: 12 },
];

const formatDateTime = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatDate = (value) => formatCalendarDate(value);

const toNumber = (value) => (value != null && value !== "" ? Number(value) : null);

const preserveDecimal = (value, scale = null) => {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || Number.isNaN(Number(trimmed))) {
      return null;
    }

    return trimmed;
  }

  const num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }

  return scale == null ? String(value) : num.toFixed(scale);
};

const WEIGHT_DECIMAL_SCALE = 3;
const MONEY_DECIMAL_SCALE = 2;

const formatWastagePercentage = (value) => {
  const preserved = preserveDecimal(value, WEIGHT_DECIMAL_SCALE);
  if (preserved == null) {
    return null;
  }

  return `${preserved}%`;
};

const resolveProCode = (row, productNameToProCode = null) => {
  if (productNameToProCode?.size) {
    for (const name of [row.product, row.sub_product]) {
      if (!name) {
        continue;
      }

      const code = productNameToProCode.get(String(name).trim().toUpperCase());
      if (code != null) {
        return code;
      }
    }
  }

  if (row.erp_pro_code != null && row.erp_pro_code !== '') {
    const code = Number(row.erp_pro_code);
    if (Number.isFinite(code)) {
      return code;
    }
  }

  return null;
};

const mapProductRow = (row, { productNameToProCode = null } = {}) => ({
  id: row.id,
  batchId: row.batch_id,
  branchId: row.branch_id ? Number(row.branch_id) : null,
  branchName: row.branch_name ?? null,
  tranNo: row.tran_no,
  tranDate: formatDate(row.tran_date),
  product: row.product,
  productName: row.product ?? null,
  subProduct: row.sub_product,
  tagPacketNo: row.tag_packet_no,
  tagNo: row.tag_packet_no ?? null,
  pieces: row.pieces,
  grossWt: row.gross_wt,
  grossWeight: preserveDecimal(row.gross_wt, WEIGHT_DECIMAL_SCALE),
  netWt: row.net_wt,
  netWeight: preserveDecimal(row.net_wt, WEIGHT_DECIMAL_SCALE),
  lessWt: preserveDecimal(row.less_weight, WEIGHT_DECIMAL_SCALE),
  wastagePercentage: formatWastagePercentage(row.wastage_percentage),
  wastageAmount: preserveDecimal(row.wastage_amount, WEIGHT_DECIMAL_SCALE),
  makingCharge: preserveDecimal(row.making_charge ?? row.max_mc, MONEY_DECIMAL_SCALE),
  maxMC: preserveDecimal(row.max_mc, MONEY_DECIMAL_SCALE),
  proCode: resolveProCode(row, productNameToProCode),
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

const buildScopeFilterClause = ({
  productName = null,
  subProductName = null,
  centerName = null,
} = {}) => {
  const conditions = [];
  const params = [];

  if (productName) {
    conditions.push("AND p.product = ?");
    params.push(productName);
  }

  if (subProductName) {
    conditions.push("AND p.sub_product = ?");
    params.push(subProductName);
  }

  if (centerName) {
    conditions.push("AND p.counter_name = ?");
    params.push(centerName);
  }

  return {
    clause: conditions.join(" "),
    params,
  };
};

const buildProductListQuery = ({
  search,
  batchId = null,
  branchIds = [],
  productName = null,
  subProductName = null,
  centerName = null,
}) => {
  const { clause: searchClause, params: searchParams } =
    buildSearchClause(search);
  const { clause: scopeClause, params: scopeParams } = buildScopeFilterClause({
    productName,
    subProductName,
    centerName,
  });
  const pricingJoin = `
    LEFT JOIN product_pricing pp ON pp.product_id = p.id
    LEFT JOIN product_master pm ON pm.product_id = p.id
  `;

  if (batchId) {
    return {
      baseFrom: `
        FROM products p
        INNER JOIN product_upload_batches pub ON pub.id = p.batch_id
        LEFT JOIN branches b ON b.id = pub.branch_id
        ${pricingJoin}
        WHERE ${batchAllProductsWhere.replace("batch_id = ?", "p.batch_id = ?")}
        ${scopeClause}
        ${searchClause}
      `,
      params: [batchId, ...scopeParams, ...searchParams],
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
      ${pricingJoin}
      WHERE ${activeBranchProductsWhere}
      ${branchFilter.clause}
      ${scopeClause}
      ${searchClause}
    `,
    params: [...branchFilter.params, ...scopeParams, ...searchParams],
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
  productName = null,
  subProductName = null,
  centerName = null,
}) => {
  const query = buildProductListQuery({
    search,
    batchId,
    branchIds,
    productName,
    subProductName,
    centerName,
  });

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
       p.item_pieces, p.weight_gram, p.weight_carat, p.created_at,
       pp.less_weight, pp.wastage_percentage, pp.wastage_amount, pp.making_charge, pp.max_mc,
       pm.erp_pro_code
     ${baseFrom}
     ORDER BY p.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  let resolvedBatchId = batchId;

  if (!resolvedBatchId && scope.length === 1) {
    resolvedBatchId = await getActiveBatchId(scope[0]);
  }

  const productNameToProCode = await erpProductCodeService.buildProductNameToCodeMap();

  return {
    batchId: resolvedBatchId,
    branchIds: scope,
    pagination: { page, limit, totalRecords, totalPages },
    data: rows.map((row) => mapProductRow(row, { productNameToProCode })),
  };
};

export const getProducts = (options = {}) =>
  inventoryDropdownService.getProducts(options);

export const getProductsForBranch = (branchIds) =>
  inventoryDropdownService.getProducts({ branchIds });

export const getLocationStockCount = (
  branchIds,
  { product = null, subProduct = null, center = null } = {},
) =>
  inventoryDropdownService.getLocationStockCount({
    branchIds,
    product,
    subProduct,
    center,
  });

export const getSubProducts = (product, branchIds = []) =>
  inventoryDropdownService.getSubProducts(product, { branchIds });

export const getCenters = (product, subProduct, branchIds = []) =>
  inventoryDropdownService.getCenters(product, subProduct, { branchIds });

const mapPrintDetailRow = (row, { branchName = null, productNameToProCode = null } = {}) => {
  const grossWt = preserveDecimal(row.gross_wt, WEIGHT_DECIMAL_SCALE);
  const netWt = preserveDecimal(row.net_wt, WEIGHT_DECIMAL_SCALE);
  const tagNo = row.tag_packet_no ?? null;
  const productName = row.product ?? null;

  return {
    productName,
    subProductName: row.sub_product ?? null,
    tagNo,
    grossWt,
    netWt,
    weightGram: preserveDecimal(row.weight_gram, WEIGHT_DECIMAL_SCALE),
    weightCarat: preserveDecimal(row.weight_carat, WEIGHT_DECIMAL_SCALE),
    pieces: toNumber(row.pieces),
    counterName: row.counter_name ?? null,
    proCode: resolveProCode(row, productNameToProCode),
    purity: row.purity ?? null,
    metal: row.metal ?? null,
    grossWeight: grossWt,
    netWeight: netWt,
    lessWt: preserveDecimal(row.less_weight, WEIGHT_DECIMAL_SCALE),
    wastagePercentage: formatWastagePercentage(row.wastage_percentage),
    wastageAmount: preserveDecimal(row.wastage_amount, WEIGHT_DECIMAL_SCALE),
    makingCharge: preserveDecimal(row.making_charge ?? row.max_mc, MONEY_DECIMAL_SCALE),
    maxMC: preserveDecimal(row.max_mc, MONEY_DECIMAL_SCALE),
    goldRate: preserveDecimal(row.gold_rate, MONEY_DECIMAL_SCALE),
    amount: preserveDecimal(row.selling_price, MONEY_DECIMAL_SCALE),
    saleValue: preserveDecimal(row.sale_value, MONEY_DECIMAL_SCALE),
    rate: preserveDecimal(row.rate, MONEY_DECIMAL_SCALE),
    rateId: preserveDecimal(row.rate_id, MONEY_DECIMAL_SCALE),
    perPcsValue: preserveDecimal(row.per_pcs_value, MONEY_DECIMAL_SCALE),
    perGramValue: preserveDecimal(row.per_gram_value, MONEY_DECIMAL_SCALE),
    branchName: branchName ?? row.branch_name ?? null,
    qrCode: row.qr_code ?? tagNo,
  };
};

const PRINT_DETAILS_PRICING_JOIN = `
  LEFT JOIN product_pricing pp ON pp.product_id = p.id
`;

const PRINT_DETAILS_EXTENSION_JOINS = `
  LEFT JOIN product_master pm ON pm.product_id = p.id
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
  p.counter_name,
  pp.sale_value,
  pp.rate,
  pp.rate_id,
  pp.per_pcs_value,
  pp.per_gram_value
`;

const PRINT_DETAILS_EXTENDED_SELECT = `
  ${PRINT_DETAILS_BASE_SELECT},
  pm.erp_pro_code,
  pm.purity,
  pm.metal,
  pp.wastage_percentage,
  pp.wastage_amount,
  pp.making_charge,
  pp.max_mc,
  pp.less_weight,
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
       ${PRINT_DETAILS_PRICING_JOIN}
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
  const joinClause = includeExtended
    ? `${PRINT_DETAILS_PRICING_JOIN}${PRINT_DETAILS_EXTENSION_JOINS}`
    : PRINT_DETAILS_PRICING_JOIN;

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

const getAllProductsForExport = async ({
  search,
  batchId = null,
  branchIds = [],
  productName = null,
  subProductName = null,
  centerName = null,
}) => {
  const query = buildProductListQuery({
    search,
    batchId,
    branchIds,
    productName,
    subProductName,
    centerName,
  });

  if (!query) {
    return { data: [], totalRecords: 0 };
  }

  const { baseFrom, params } = query;

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS totalRecords ${baseFrom}`,
    params,
  );

  const totalRecords = Number(countRows[0].totalRecords);

  if (totalRecords === 0) {
    return { data: [], totalRecords: 0 };
  }

  const [rows] = await pool.execute(
    `SELECT
       p.id, p.batch_id, pub.branch_id, b.name AS branch_name,
       p.tran_no, p.tran_date, p.product, p.sub_product, p.tag_packet_no,
       p.pieces, p.gross_wt, p.net_wt, p.counter_name, p.size, p.tag_type,
       p.item_pieces, p.weight_gram, p.weight_carat, p.created_at,
       pp.less_weight, pp.wastage_percentage, pp.wastage_amount, pp.making_charge, pp.max_mc,
       pm.erp_pro_code
     ${baseFrom}
     ORDER BY p.id DESC`,
    params,
  );

  const productNameToProCode =
    await erpProductCodeService.buildProductNameToCodeMap();

  return {
    totalRecords,
    data: rows.map((row) => mapProductRow(row, { productNameToProCode })),
  };
};

const buildStockExcelBuffer = async (rows) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Stock");

  worksheet.columns = STOCK_EXCEL_COLUMNS;

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFB8860B" },
  };

  rows.forEach((row, index) => {
    worksheet.addRow({
      sno: index + 1,
      proCode: row.proCode ?? "",
      product: row.product ?? "",
      tagPacketNo: row.tagPacketNo ?? "",
      grossWeight: row.grossWeight ?? "",
      netWeight: row.netWeight ?? "",
      lessWt: row.lessWt ?? "",
      wastagePercentage: row.wastagePercentage ?? "",
      makingCharge: row.makingCharge ?? "",
      tranNo: row.tranNo ?? "",
      tranDate: row.tranDate ?? "",
      branchName: row.branchName ?? "",
      subProduct: row.subProduct ?? "",
      pieces: row.pieces ?? "",
      counterName: row.counterName ?? "",
      size: row.size ?? "",
      tagType: row.tagType ?? "",
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

const getStockExportFileName = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `stock-list-${stamp}.xlsx`;
};

const exportProductListExcel = async ({
  search,
  batchId = null,
  branchIds = [],
  productName = null,
  subProductName = null,
  centerName = null,
}) => {
  const { data } = await getAllProductsForExport({
    search,
    batchId,
    branchIds,
    productName,
    subProductName,
    centerName,
  });

  const buffer = await buildStockExcelBuffer(data);

  return {
    buffer,
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileName: getStockExportFileName(),
    rowCount: data.length,
  };
};

export { getProductList, getPrintDetails, exportProductListExcel };

export default {
  getProducts,
  getProductsForBranch,
  getLocationStockCount,
  getSubProducts,
  getCenters,
  getProductList,
  getPrintDetails,
  exportProductListExcel,
};
