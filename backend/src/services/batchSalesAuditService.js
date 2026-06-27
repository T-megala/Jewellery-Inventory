import pool from "../config/database.js";

const AUDIT_INSERT_BATCH_SIZE = 2000;

const COUNTER_EXPR = `CASE
  WHEN counter_name IS NULL OR TRIM(counter_name) = '' THEN 'Unassigned'
  ELSE TRIM(counter_name)
END`;

const PREV_COUNTER_EXPR = `CASE
  WHEN prev.counter_name IS NULL OR TRIM(prev.counter_name) = '' THEN 'Unassigned'
  ELSE TRIM(prev.counter_name)
END`;

const PREV_TAG_FILTER = `
  prev.tag_packet_no IS NOT NULL
  AND TRIM(prev.tag_packet_no) != ''
`;

const TAG_MATCH_ON_CURR = `
  UPPER(TRIM(curr.tag_packet_no)) = UPPER(TRIM(prev.tag_packet_no))
`;

const TAG_FILTER = `
  tag_packet_no IS NOT NULL
  AND TRIM(tag_packet_no) != ''
`;

const toSoldPiecesInt = (value) => Math.max(0, Math.round(Number(value ?? 0)));

const logAudit = (message, meta = undefined) => {
  if (meta === undefined) {
    console.info(`[batch-sales-audit] ${message}`);
    return;
  }

  console.info(`[batch-sales-audit] ${message}`, meta);
};

export const deleteBatchSalesAudit = async (connection, batchId) => {
  await connection.execute(`DELETE FROM inventory_sales_audit WHERE batch_id = ?`, [
    batchId,
  ]);
};

const countRemovedTags = async (connection, previousBatchId, currentBatchId) => {
  const [[row]] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM products prev
     LEFT JOIN products curr
       ON curr.batch_id = ?
      AND ${TAG_MATCH_ON_CURR}
     WHERE prev.batch_id = ?
       AND ${PREV_TAG_FILTER}
       AND curr.id IS NULL`,
    [currentBatchId, previousBatchId],
  );

  return Number(row.total ?? 0);
};

const countPieceReductions = async (connection, previousBatchId, currentBatchId) => {
  const [[row]] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM products prev
     INNER JOIN products curr
       ON curr.batch_id = ?
      AND ${TAG_MATCH_ON_CURR}
     WHERE prev.batch_id = ?
       AND ${PREV_TAG_FILTER}
       AND COALESCE(prev.pieces, 0) > COALESCE(curr.pieces, 0)`,
    [currentBatchId, previousBatchId],
  );

  return Number(row.total ?? 0);
};

const insertRemovedTagAudits = async (
  connection,
  batchId,
  previousBatchId,
  currentBatchId,
) => {
  const [result] = await connection.execute(
    `INSERT INTO inventory_sales_audit
      (batch_id, previous_batch_id, tag_no, product, sub_product, counter_name,
       sale_type, previous_pieces, current_pieces, sold_pieces, sold_tags)
     SELECT
       ?,
       ?,
       TRIM(prev.tag_packet_no),
       prev.product,
       prev.sub_product,
       ${PREV_COUNTER_EXPR},
       'TAG_REMOVED',
       prev.pieces,
       NULL,
       COALESCE(prev.pieces, 0),
       1
     FROM products prev
     LEFT JOIN products curr
       ON curr.batch_id = ?
      AND ${TAG_MATCH_ON_CURR}
     WHERE prev.batch_id = ?
       AND ${PREV_TAG_FILTER}
       AND curr.id IS NULL`,
    [batchId, previousBatchId, currentBatchId, previousBatchId],
  );

  return Number(result.affectedRows ?? 0);
};

const insertPieceReductionAudits = async (
  connection,
  batchId,
  previousBatchId,
  currentBatchId,
) => {
  const [result] = await connection.execute(
    `INSERT INTO inventory_sales_audit
      (batch_id, previous_batch_id, tag_no, product, sub_product, counter_name,
       sale_type, previous_pieces, current_pieces, sold_pieces, sold_tags)
     SELECT
       ?,
       ?,
       TRIM(prev.tag_packet_no),
       prev.product,
       prev.sub_product,
       ${PREV_COUNTER_EXPR},
       'PIECE_REDUCTION',
       prev.pieces,
       curr.pieces,
       COALESCE(prev.pieces, 0) - COALESCE(curr.pieces, 0),
       0
     FROM products prev
     INNER JOIN products curr
       ON curr.batch_id = ?
      AND ${TAG_MATCH_ON_CURR}
     WHERE prev.batch_id = ?
       AND ${PREV_TAG_FILTER}
       AND COALESCE(prev.pieces, 0) > COALESCE(curr.pieces, 0)`,
    [batchId, previousBatchId, currentBatchId, previousBatchId],
  );

  return Number(result.affectedRows ?? 0);
};

const resolveSameBranchPreviousBatchId = async (
  connection,
  batchId,
  previousBatchId,
) => {
  if (!previousBatchId) {
    return null;
  }

  const [[currentRows], [previousRows]] = await Promise.all([
    connection.execute(
      `SELECT branch_id FROM product_upload_batches WHERE id = ?`,
      [batchId],
    ),
    connection.execute(
      `SELECT branch_id FROM product_upload_batches WHERE id = ?`,
      [previousBatchId],
    ),
  ]);

  const currentBranchId = Number(currentRows[0]?.branch_id ?? 0);
  const previousBranchId = Number(previousRows[0]?.branch_id ?? 0);

  if (
    !currentBranchId ||
    !previousBranchId ||
    currentBranchId !== previousBranchId
  ) {
    logAudit("previous batch ignored: different branch", {
      batchId,
      previousBatchId,
      currentBranchId,
      previousBranchId,
    });
    return null;
  }

  return Number(previousBatchId);
};

export const rebuildBatchSalesAudit = async (
  connection,
  batchId,
  previousBatchId,
) => {
  previousBatchId = await resolveSameBranchPreviousBatchId(
    connection,
    batchId,
    previousBatchId,
  );

  if (!previousBatchId) {
    await deleteBatchSalesAudit(connection, batchId);
    return {
      removedTags: 0,
      pieceReductions: 0,
      soldTags: 0,
      soldPieces: 0,
      durationMs: 0,
    };
  }

  const startedAt = Date.now();

  await deleteBatchSalesAudit(connection, batchId);

  const removedTags = await insertRemovedTagAudits(
    connection,
    batchId,
    previousBatchId,
    batchId,
  );
  const pieceReductions = await insertPieceReductionAudits(
    connection,
    batchId,
    previousBatchId,
    batchId,
  );

  const [[totals]] = await connection.execute(
    `SELECT
       COALESCE(SUM(sold_tags), 0) AS soldTags,
       COALESCE(SUM(sold_pieces), 0) AS soldPieces
     FROM inventory_sales_audit
     WHERE batch_id = ?`,
    [batchId],
  );

  const summary = {
    removedTags,
    pieceReductions,
    soldTags: Number(totals.soldTags ?? 0),
    soldPieces: toSoldPiecesInt(totals.soldPieces),
    durationMs: Date.now() - startedAt,
  };

  logAudit("audit rebuilt", { batchId, previousBatchId, ...summary });

  return summary;
};

export const getBatchSalesTotalsByCounter = async (connection, batchId) => {
  const [rows] = await connection.execute(
    `SELECT
       counter_name AS counterName,
       COALESCE(SUM(sold_tags), 0) AS soldTags,
       COALESCE(SUM(sold_pieces), 0) AS soldPieces
     FROM inventory_sales_audit
     WHERE batch_id = ?
     GROUP BY counter_name`,
    [batchId],
  );

  return rows.map((row) => ({
    counterName: row.counterName,
    soldTags: Number(row.soldTags ?? 0),
    soldPieces: toSoldPiecesInt(row.soldPieces),
  }));
};

export const countBatchStockPieces = async (connection, batchId) => {
  const [[row]] = await connection.execute(
    `SELECT COALESCE(SUM(COALESCE(pieces, 0)), 0) AS totalPieces
     FROM products
     WHERE batch_id = ?
       AND ${TAG_FILTER}`,
    [batchId],
  );

  return toSoldPiecesInt(row.totalPieces);
};

export const countBatchStockPiecesByCounter = async (connection, batchId) => {
  const [rows] = await connection.execute(
    `SELECT
       ${COUNTER_EXPR} AS counter_name,
       COALESCE(SUM(COALESCE(pieces, 0)), 0) AS totalPieces
     FROM products
     WHERE batch_id = ?
       AND ${TAG_FILTER}
     GROUP BY ${COUNTER_EXPR}`,
    [batchId],
  );

  return rows.map((row) => ({
    counterName: row.counter_name,
    totalPieces: toSoldPiecesInt(row.totalPieces),
  }));
};

export const benchmarkBatchComparison = async (previousBatchId, currentBatchId) => {
  const connection = await pool.getConnection();

  try {
    const startedAt = Date.now();
    const removedCount = await countRemovedTags(
      connection,
      previousBatchId,
      currentBatchId,
    );
    const reductionCount = await countPieceReductions(
      connection,
      previousBatchId,
      currentBatchId,
    );
    const compareDurationMs = Date.now() - startedAt;

    const auditStartedAt = Date.now();
    await deleteBatchSalesAudit(connection, currentBatchId);
    await insertRemovedTagAudits(
      connection,
      currentBatchId,
      previousBatchId,
      currentBatchId,
    );
    await insertPieceReductionAudits(
      connection,
      currentBatchId,
      previousBatchId,
      currentBatchId,
    );
    const auditDurationMs = Date.now() - auditStartedAt;

    return {
      previousBatchId,
      currentBatchId,
      removedCount,
      reductionCount,
      compareDurationMs,
      auditDurationMs,
      totalDurationMs: compareDurationMs + auditDurationMs,
    };
  } finally {
    connection.release();
  }
};

export default {
  rebuildBatchSalesAudit,
  deleteBatchSalesAudit,
  getBatchSalesTotalsByCounter,
  countBatchStockPieces,
  countBatchStockPiecesByCounter,
  benchmarkBatchComparison,
  AUDIT_INSERT_BATCH_SIZE,
};
