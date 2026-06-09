import pool from "../config/database.js";
import { getActiveBatchId } from "./productBatchService.js";
import inventoryDropdownService from "./inventoryDropdownService.js";

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
      product LIKE ?
      OR sub_product LIKE ?
      OR tag_packet_no LIKE ?
      OR counter_name LIKE ?
      OR CAST(tran_no AS CHAR) LIKE ?
      OR size LIKE ?
      OR tag_type LIKE ?
    )`,
    params: [term, term, term, term, term, term, term],
  };
};

const getProductList = async ({ search, page, limit, offset, batchId = null }) => {
  const activeBatchId = batchId ?? (await getActiveBatchId());

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
    FROM products
    WHERE batch_id = ?
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
       id, batch_id, tran_no, tran_date, product, sub_product, tag_packet_no,
       pieces, gross_wt, net_wt, counter_name, size, tag_type,
       item_pieces, weight_gram, weight_carat, created_at
     ${baseFrom}
     ORDER BY id DESC
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

export const getSubProducts = (product) =>
  inventoryDropdownService.getSubProducts(product);

export const getCenters = (product, subProduct) =>
  inventoryDropdownService.getCenters(product, subProduct);

export { getProductList };

export default { getProducts, getSubProducts, getCenters, getProductList };
