import "dotenv/config";
import pool from "../src/config/database.js";

const db = process.env.DB_NAME;

const [tables] = await pool.execute(
  `SELECT TABLE_NAME, ENGINE, TABLE_COLLATION, TABLE_ROWS
   FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
   ORDER BY TABLE_NAME`,
  [db]
);

const [textCols] = await pool.execute(
  `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, CHARACTER_SET_NAME, COLLATION_NAME
   FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = ? AND COLLATION_NAME IS NOT NULL
   ORDER BY COLLATION_NAME, TABLE_NAME, ORDINAL_POSITION`,
  [db]
);

const collationByTable = {};
for (const col of textCols) {
  if (!collationByTable[col.TABLE_NAME]) {
    collationByTable[col.TABLE_NAME] = new Set();
  }
  collationByTable[col.TABLE_NAME].add(col.COLLATION_NAME);
}

const mixedCollationTables = Object.entries(collationByTable)
  .filter(([, set]) => set.size > 1)
  .map(([table, set]) => ({ table, collations: [...set] }));

const [fks] = await pool.execute(
  `SELECT tc.TABLE_NAME, kcu.COLUMN_NAME, kcu.CONSTRAINT_NAME,
          kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME,
          rc.UPDATE_RULE, rc.DELETE_RULE
   FROM information_schema.TABLE_CONSTRAINTS tc
   JOIN information_schema.KEY_COLUMN_USAGE kcu
     ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
    AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
   JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
     ON rc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
    AND rc.CONSTRAINT_SCHEMA = tc.TABLE_SCHEMA
   WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
     AND tc.TABLE_SCHEMA = ?
   ORDER BY tc.TABLE_NAME, kcu.COLUMN_NAME`,
  [db]
);

const [indexes] = await pool.execute(
  `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE,
          GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols,
          INDEX_TYPE
   FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = ?
   GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE, INDEX_TYPE
   ORDER BY TABLE_NAME, INDEX_NAME`,
  [db]
);

const [idCols] = await pool.execute(
  `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
   FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = ?
     AND (COLUMN_NAME LIKE '%\\_id' ESCAPE '\\\\' OR COLUMN_NAME = 'id')
   ORDER BY TABLE_NAME, COLUMN_NAME`,
  [db]
);

const fkSet = new Set(fks.map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}`));
const missingFk = idCols.filter(
  (c) => c.COLUMN_NAME !== "id" && !fkSet.has(`${c.TABLE_NAME}.${c.COLUMN_NAME}`)
);

const expectedFks = [
  ["daily_sales_summary", "batch_id", "product_upload_batches"],
  ["inventory_sales_audit", "batch_id", "product_upload_batches"],
  ["inventory_sales_audit", "previous_batch_id", "product_upload_batches"],
  ["latest_stock_verification", "branch_id", "branches"],
  ["latest_stock_verification", "verification_id", "stock_verification"],
  ["products", "batch_id", "product_upload_batches"],
  ["stock_verification", "branch_id", "branches"],
  ["stock_verification_details", "verification_id", "stock_verification"],
  ["stock_verification_details", "latest_scan_id", "latest_stock_verification"],
  ["user_branches", "user_id", "users"],
  ["user_branches", "branch_id", "branches"],
  ["users", "role_id", "roles"],
  ["user_logs", "user_id", "users"],
  ["permissions", "parent_id", "permissions"],
  ["role_permissions", "role_id", "roles"],
  ["role_permissions", "permission_id", "permissions"],
  ["product_upload_batches", "branch_id", "branches"],
];

const expectedUniques = [
  ["users", "uk_users_username", "username"],
];

const missingExpected = expectedFks.filter(
  ([table, column]) => !fkSet.has(`${table}.${column}`)
);

const indexKey = (table, name) => `${table}.${name}`;
const indexSet = new Set(indexes.map((i) => indexKey(i.TABLE_NAME, i.INDEX_NAME)));
const missingExpectedUniques = expectedUniques.filter(
  ([table, name]) => !indexSet.has(indexKey(table, name))
);

const redundant = [];
const byTable = {};
for (const idx of indexes) {
  if (!byTable[idx.TABLE_NAME]) byTable[idx.TABLE_NAME] = [];
  byTable[idx.TABLE_NAME].push(idx);
}
for (const [table, idxs] of Object.entries(byTable)) {
  for (const a of idxs) {
    for (const b of idxs) {
      if (a.INDEX_NAME === b.INDEX_NAME) continue;
      if (b.cols.startsWith(`${a.cols},`) && a.NON_UNIQUE === b.NON_UNIQUE) {
        redundant.push({
          table,
          prefixIndex: a.INDEX_NAME,
          supersetIndex: b.INDEX_NAME,
          prefixCols: a.cols,
          supersetCols: b.cols,
        });
      }
    }
  }
}

const [[dbDefaults]] = await pool.execute(
  "SELECT @@character_set_database AS charset, @@collation_database AS collation"
);

const tableCollationMix = [...new Set(tables.map((t) => t.TABLE_COLLATION))];
const collationCounts = {};
for (const col of textCols) {
  collationCounts[col.COLLATION_NAME] =
    (collationCounts[col.COLLATION_NAME] || 0) + 1;
}

console.log(
  JSON.stringify(
    {
      database: db,
      dbDefaults,
      tableCollationMix,
      mixedCollationTables,
      collationCounts,
      tableSummary: tables.map((t) => ({
        name: t.TABLE_NAME,
        engine: t.ENGINE,
        collation: t.TABLE_COLLATION,
        approxRows: t.TABLE_ROWS,
      })),
      foreignKeyCount: fks.length,
      foreignKeys: fks,
      missingExpectedFks: missingExpected,
      missingExpectedUniques: missingExpectedUniques,
      columnsWithoutFk: missingFk,
      indexCount: indexes.length,
      indexes,
      redundantIndexCandidates: redundant,
    },
    null,
    2
  )
);

await pool.end();
