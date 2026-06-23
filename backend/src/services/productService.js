import pool from "../config/database.js";
import { getActiveBatchId } from "./productBatchService.js";
import inventoryDropdownService from "./inventoryDropdownService.js";
import { batchAllProductsWhere } from "../utils/productQueryHelper.js";

const formatDateTime = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
};

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

const getProductList = async ({
  search,
  page,
  limit,
  offset,
  batchId = null,
  branchId = null,
}) => {
  const activeBatchId = batchId ?? (await getActiveBatchId(branchId));

  if (!activeBatchId) {
    return {
      pagination: { page, limit, totalRecords: 0, totalPages: 0 },
      data: [],
      batchId: null,
    };
  }

  const { clause: searchClause, params: searchParams } =
    buildSearchClause(search);

  const baseFrom = `
    FROM products p
    INNER JOIN product_upload_batches pub ON pub.id = p.batch_id
    LEFT JOIN branches b ON b.id = pub.branch_id
    WHERE ${batchAllProductsWhere.replace("batch_id = ?", "p.batch_id = ?")}
    ${searchClause}
  `;

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS totalRecords ${baseFrom}`,
    [activeBatchId, ...searchParams],
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
    [activeBatchId, ...searchParams],
  );

  return {
    batchId: activeBatchId,
    pagination: { page, limit, totalRecords, totalPages },
    data: rows.map(mapProductRow),
  };
};

export const getProducts = () => inventoryDropdownService.getProducts();

export const getProductsForBranch = (branchId) =>
  inventoryDropdownService.getProducts({ branchId });

export const getSubProducts = (product, branchId = null) =>
  inventoryDropdownService.getSubProducts(product, { branchId });

export const getCenters = (product, subProduct, branchId = null) =>
  inventoryDropdownService.getCenters(product, subProduct, { branchId });

export { getProductList };

export default { getProducts, getSubProducts, getCenters, getProductList };
