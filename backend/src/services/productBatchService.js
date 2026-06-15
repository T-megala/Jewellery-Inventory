import pool from '../config/database.js';
import { hasProductChanged } from '../utils/productBatchHelper.js';
import { batchProductsWhere } from '../utils/productQueryHelper.js';

const formatDateTime = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

export const getActiveBatchId = async (connection = pool) => {
  const [rows] = await connection.execute(
    `SELECT id FROM product_upload_batches WHERE is_active = 1 ORDER BY id DESC LIMIT 1`
  );
  return rows[0]?.id ?? null;
};

/** Every import creates a new active batch; prior batch is deactivated. */
export const resolveActiveBatch = async (connection, uploadedBy = null) => {
  const [activeRows] = await connection.execute(
    `SELECT id FROM product_upload_batches
     WHERE is_active = 1
     ORDER BY id DESC
     LIMIT 1`,
  );

  const previousBatchId = activeRows[0]?.id ?? null;

  await connection.execute(
    `UPDATE product_upload_batches SET is_active = 0 WHERE is_active = 1`,
  );

  const [insertResult] = await connection.execute(
    `INSERT INTO product_upload_batches (batch_date, uploaded_at, uploaded_by, is_active)
     VALUES (CURDATE(), NOW(), ?, 1)`,
    [uploadedBy],
  );

  return {
    batchId: insertResult.insertId,
    isNewBatch: true,
    previousBatchId,
  };
};

export const listBatches = async () => {
  const [rows] = await pool.execute(
    `SELECT
       b.id,
       b.batch_date,
       b.uploaded_at,
       b.uploaded_by,
       b.is_active,
       COUNT(p.id) AS product_count
     FROM product_upload_batches b
     LEFT JOIN products p ON p.batch_id = b.id
     GROUP BY b.id, b.batch_date, b.uploaded_at, b.uploaded_by, b.is_active
     ORDER BY b.id DESC`
  );

  return rows.map((row) => ({
    id: row.id,
    batchDate: row.batch_date,
    uploadedAt: formatDateTime(row.uploaded_at),
    uploadedBy: row.uploaded_by,
    isActive: Boolean(row.is_active),
    productCount: Number(row.product_count),
  }));
};

const mapProductRow = (row) => ({
  id: row.id,
  batchId: row.batch_id,
  tranNo: row.tran_no,
  tranDate: row.tran_date,
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
});

export const getBatchProducts = async (batchId, { search, page, limit, offset }) => {
  const searchClause = search
    ? `AND (
        p.product LIKE ?
        OR p.sub_product LIKE ?
        OR p.tag_packet_no LIKE ?
        OR p.counter_name LIKE ?
      )`
    : '';
  const searchParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`] : [];

  const baseFrom = `
    FROM products p
    WHERE ${batchProductsWhere.replace('batch_id = ?', 'p.batch_id = ?')}
    ${searchClause}
  `;

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS totalRecords ${baseFrom}`,
    [batchId, ...searchParams]
  );

  const totalRecords = Number(countRows[0].totalRecords);
  const totalPages = totalRecords === 0 ? 0 : Math.ceil(totalRecords / limit);

  const [rows] = await pool.execute(
    `SELECT p.id, p.batch_id, p.tran_no, p.tran_date, p.product, p.sub_product,
            p.tag_packet_no, p.pieces, p.gross_wt, p.net_wt, p.counter_name,
            p.size, p.tag_type, p.item_pieces, p.weight_gram, p.weight_carat, p.created_at
     ${baseFrom}
     ORDER BY p.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    [batchId, ...searchParams]
  );

  return {
    pagination: { page, limit, totalRecords, totalPages },
    data: rows.map(mapProductRow),
  };
};

export const compareBatches = async (currentBatchId, previousBatchId) => {
  const [currentRows] = await pool.execute(
    `SELECT * FROM products WHERE batch_id = ?`,
    [currentBatchId]
  );
  const [previousRows] = await pool.execute(
    `SELECT * FROM products WHERE batch_id = ?`,
    [previousBatchId]
  );

  const currentMap = new Map(
    currentRows.map((row) => [String(row.tag_packet_no).trim(), row])
  );
  const previousMap = new Map(
    previousRows.map((row) => [String(row.tag_packet_no).trim(), row])
  );

  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];

  for (const [tag, row] of currentMap.entries()) {
    const previous = previousMap.get(tag);

    if (!previous) {
      added.push(mapProductRow(row));
      continue;
    }

    if (hasProductChanged(previous, row)) {
      changed.push({
        tagPacketNo: tag,
        previous: mapProductRow(previous),
        current: mapProductRow(row),
      });
    } else {
      unchanged.push(mapProductRow(row));
    }
  }

  for (const [tag, row] of previousMap.entries()) {
    if (!currentMap.has(tag)) {
      removed.push(mapProductRow(row));
    }
  }

  return {
    currentBatchId,
    previousBatchId,
    summary: {
      addedCount: added.length,
      removedCount: removed.length,
      changedCount: changed.length,
      unchangedCount: unchanged.length,
    },
    added,
    removed,
    changed,
    unchanged,
  };
};

export default {
  getActiveBatchId,
  resolveActiveBatch,
  listBatches,
  getBatchProducts,
  compareBatches,
};
