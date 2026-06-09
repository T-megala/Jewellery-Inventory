import pool from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import { parseStockExcel } from '../utils/excelParser.js';
import { hasProductChanged } from '../utils/productBatchHelper.js';
import { resolveActiveBatch } from '../services/productBatchService.js';

const BATCH_SIZE = 200;

const PRODUCT_FIELDS = [
  'tran_no',
  'tran_date',
  'product',
  'sub_product',
  'tag_packet_no',
  'pieces',
  'gross_wt',
  'net_wt',
  'counter_name',
  'size',
  'tag_type',
  'item_pieces',
  'weight_gram',
  'weight_carat',
];

const bulkInsert = async (connection, batchId, rows) => {
  if (rows.length === 0) {
    return;
  }

  const placeholders = rows
    .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .join(', ');

  const values = rows.flatMap((row) => [
    batchId,
    row.tran_no,
    row.tran_date,
    row.product,
    row.sub_product,
    row.tag_packet_no,
    row.pieces,
    row.gross_wt,
    row.net_wt,
    row.counter_name,
    row.size,
    row.tag_type,
    row.item_pieces,
    row.weight_gram,
    row.weight_carat,
  ]);

  await connection.execute(
    `INSERT INTO products
      (batch_id, tran_no, tran_date, product, sub_product, tag_packet_no,
       pieces, gross_wt, net_wt, counter_name, size, tag_type,
       item_pieces, weight_gram, weight_carat)
     VALUES ${placeholders}`,
    values
  );
};

const updateProduct = async (connection, id, row) => {
  await connection.execute(
    `UPDATE products SET
       tran_no = ?,
       tran_date = ?,
       product = ?,
       sub_product = ?,
       pieces = ?,
       gross_wt = ?,
       net_wt = ?,
       counter_name = ?,
       size = ?,
       tag_type = ?,
       item_pieces = ?,
       weight_gram = ?,
       weight_carat = ?
     WHERE id = ?`,
    [
      row.tran_no,
      row.tran_date,
      row.product,
      row.sub_product,
      row.pieces,
      row.gross_wt,
      row.net_wt,
      row.counter_name,
      row.size,
      row.tag_type,
      row.item_pieces,
      row.weight_gram,
      row.weight_carat,
      id,
    ]
  );
};

const loadExistingProducts = async (connection, batchId) => {
  const [rows] = await connection.execute(
    `SELECT id, ${PRODUCT_FIELDS.join(', ')}
     FROM products
     WHERE batch_id = ?`,
    [batchId]
  );

  const map = new Map();

  for (const row of rows) {
    const tag = String(row.tag_packet_no ?? '').trim();
    if (tag) {
      map.set(tag, row);
    }
  }

  return map;
};

const importProductsFromExcel = async (buffer, uploadedBy = null) => {
  let parsed;

  try {
    parsed = parseStockExcel(buffer);
  } catch (error) {
    throw new ApiError(400, error.message);
  }

  const { validRows, totalRowsInFile, skipped } = parsed;

  if (validRows.length === 0) {
    return {
      totalRowsInFile,
      skipped,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      batchId: null,
      isNewBatch: false,
    };
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { batchId, isNewBatch } = await resolveActiveBatch(
      connection,
      uploadedBy
    );
    const existingMap = await loadExistingProducts(connection, batchId);

    const toInsert = [];
    const toUpdate = [];
    let unchanged = 0;

    for (const row of validRows) {
      const tag = String(row.tag_packet_no).trim();
      const existing = existingMap.get(tag);

      if (!existing) {
        toInsert.push(row);
        existingMap.set(tag, row);
        continue;
      }

      if (hasProductChanged(existing, row)) {
        toUpdate.push({ id: existing.id, row });
      } else {
        unchanged += 1;
      }
    }

    for (let index = 0; index < toInsert.length; index += BATCH_SIZE) {
      await bulkInsert(connection, batchId, toInsert.slice(index, index + BATCH_SIZE));
    }

    for (const item of toUpdate) {
      await updateProduct(connection, item.id, item.row);
    }

    await connection.commit();

    return {
      batchId,
      isNewBatch,
      totalRowsInFile,
      skipped,
      inserted: toInsert.length,
      updated: toUpdate.length,
      unchanged,
    };
  } catch (error) {
    await connection.rollback();
    console.error('Product import failed:', error);
    throw error;
  } finally {
    connection.release();
  }
};

export default {
  importProductsFromExcel,
};
