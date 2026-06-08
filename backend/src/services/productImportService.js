import pool from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import { parseStockExcel } from '../utils/excelParser.js';

const BATCH_SIZE = 200;

const insertBatch = async (connection, rows) => {
  if (rows.length === 0) {
    return;
  }

  const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  const values = rows.flatMap((row) => [
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
      (tran_no, tran_date, product, sub_product, tag_packet_no,
       pieces, gross_wt, net_wt, counter_name, size, tag_type,
       item_pieces, weight_gram, weight_carat)
     VALUES ${placeholders}`,
    values
  );
};

const importProductsFromExcel = async (buffer) => {
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
      imported: 0,
      skipped,
    };
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (let index = 0; index < validRows.length; index += BATCH_SIZE) {
      const batch = validRows.slice(index, index + BATCH_SIZE);
      await insertBatch(connection, batch);
    }

    await connection.commit();

    return {
      totalRowsInFile,
      imported: validRows.length,
      skipped,
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
