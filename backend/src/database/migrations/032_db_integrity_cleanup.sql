-- DB integrity cleanup: orphan rows, branch backfill, missing FKs, stale/redundant indexes.
-- Safe to re-run; migrate.js skips duplicate constraint/index errors.

-- 1) Orphan rows referencing deleted batches
DELETE dss
FROM daily_sales_summary dss
LEFT JOIN product_upload_batches b ON b.id = dss.batch_id
WHERE b.id IS NULL;

DELETE isa
FROM inventory_sales_audit isa
LEFT JOIN product_upload_batches b ON b.id = isa.batch_id
WHERE b.id IS NULL;

DELETE isa
FROM inventory_sales_audit isa
LEFT JOIN product_upload_batches pb ON pb.id = isa.previous_batch_id
WHERE pb.id IS NULL;

-- 2) Invalid cross-branch batch comparisons (same-branch diff only)
DELETE isa
FROM inventory_sales_audit isa
INNER JOIN product_upload_batches b ON b.id = isa.batch_id
INNER JOIN product_upload_batches pb ON pb.id = isa.previous_batch_id
WHERE b.branch_id IS NOT NULL
  AND pb.branch_id IS NOT NULL
  AND b.branch_id <> pb.branch_id;

-- 3) Backfill branch_id on verification tables
--    Remove duplicate NULL-branch sessions before assigning a branch (avoids uk_sv_branch_scope_day clash).

DELETE svd
FROM stock_verification_details svd
INNER JOIN stock_verification sv ON sv.id = svd.verification_id
INNER JOIN stock_verification newer
  ON newer.branch_id IS NULL
 AND sv.branch_id IS NULL
 AND newer.verification_day = sv.verification_day
 AND newer.product_name = sv.product_name
 AND newer.sub_product_name = sv.sub_product_name
 AND newer.center_name = sv.center_name
 AND newer.id > sv.id;

DELETE lsv
FROM latest_stock_verification lsv
INNER JOIN stock_verification sv ON sv.id = lsv.verification_id
INNER JOIN stock_verification newer
  ON newer.branch_id IS NULL
 AND sv.branch_id IS NULL
 AND newer.verification_day = sv.verification_day
 AND newer.product_name = sv.product_name
 AND newer.sub_product_name = sv.sub_product_name
 AND newer.center_name = sv.center_name
 AND newer.id > sv.id;

DELETE sv
FROM stock_verification sv
INNER JOIN stock_verification newer
  ON newer.branch_id IS NULL
 AND sv.branch_id IS NULL
 AND newer.verification_day = sv.verification_day
 AND newer.product_name = sv.product_name
 AND newer.sub_product_name = sv.sub_product_name
 AND newer.center_name = sv.center_name
 AND newer.id > sv.id;

DELETE svd
FROM stock_verification_details svd
INNER JOIN stock_verification sv ON sv.id = svd.verification_id
INNER JOIN stock_verification existing
  ON existing.branch_id IS NOT NULL
 AND sv.branch_id IS NULL
 AND existing.verification_day = sv.verification_day
 AND existing.product_name = sv.product_name
 AND existing.sub_product_name = sv.sub_product_name
 AND existing.center_name = sv.center_name;

DELETE lsv
FROM latest_stock_verification lsv
INNER JOIN stock_verification sv ON sv.id = lsv.verification_id
INNER JOIN stock_verification existing
  ON existing.branch_id IS NOT NULL
 AND sv.branch_id IS NULL
 AND existing.verification_day = sv.verification_day
 AND existing.product_name = sv.product_name
 AND existing.sub_product_name = sv.sub_product_name
 AND existing.center_name = sv.center_name;

DELETE sv
FROM stock_verification sv
INNER JOIN stock_verification existing
  ON existing.branch_id IS NOT NULL
 AND sv.branch_id IS NULL
 AND existing.verification_day = sv.verification_day
 AND existing.product_name = sv.product_name
 AND existing.sub_product_name = sv.sub_product_name
 AND existing.center_name = sv.center_name;

UPDATE latest_stock_verification lsv
INNER JOIN stock_verification sv ON sv.id = lsv.verification_id
SET lsv.branch_id = sv.branch_id
WHERE lsv.branch_id IS NULL
  AND sv.branch_id IS NOT NULL;

UPDATE stock_verification
SET branch_id = (SELECT MIN(id) FROM branches)
WHERE branch_id IS NULL
  AND EXISTS (SELECT 1 FROM branches);

UPDATE latest_stock_verification lsv
INNER JOIN stock_verification sv ON sv.id = lsv.verification_id
SET lsv.branch_id = sv.branch_id
WHERE lsv.branch_id IS NULL
  AND sv.branch_id IS NOT NULL;

UPDATE latest_stock_verification
SET branch_id = (SELECT MIN(id) FROM branches)
WHERE branch_id IS NULL
  AND EXISTS (SELECT 1 FROM branches);

UPDATE stock_verification_details svd
INNER JOIN latest_stock_verification lsv ON lsv.id = svd.latest_scan_id
LEFT JOIN branches b ON b.id = lsv.branch_id
SET svd.latest_scan_id = NULL
WHERE b.id IS NULL;

DELETE lsv
FROM latest_stock_verification lsv
LEFT JOIN branches b ON b.id = lsv.branch_id
WHERE b.id IS NULL;

DELETE lsv
FROM latest_stock_verification lsv
LEFT JOIN stock_verification sv ON sv.id = lsv.verification_id
WHERE sv.id IS NULL;

DELETE svd
FROM stock_verification_details svd
LEFT JOIN stock_verification sv ON sv.id = svd.verification_id
WHERE sv.id IS NULL;

-- 4) Missing foreign keys
ALTER TABLE daily_sales_summary
  ADD CONSTRAINT fk_dss_batch
    FOREIGN KEY (batch_id) REFERENCES product_upload_batches(id) ON DELETE CASCADE;

ALTER TABLE inventory_sales_audit
  ADD CONSTRAINT fk_isa_batch
    FOREIGN KEY (batch_id) REFERENCES product_upload_batches(id) ON DELETE CASCADE;

ALTER TABLE inventory_sales_audit
  ADD CONSTRAINT fk_isa_previous_batch
    FOREIGN KEY (previous_batch_id) REFERENCES product_upload_batches(id) ON DELETE CASCADE;

ALTER TABLE latest_stock_verification
  ADD CONSTRAINT fk_lsv_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- 5) Stale index (pre-branch scope; superseded by idx_lsv_branch_day)
ALTER TABLE latest_stock_verification
  DROP INDEX idx_lsv_day_scope;

-- 6) Redundant single-column indexes covered by composite indexes
ALTER TABLE daily_sales_summary
  DROP INDEX idx_batch_id;

ALTER TABLE inventory_sales_audit
  DROP INDEX idx_isa_batch_id;

ALTER TABLE stock_verification
  DROP INDEX idx_sv_branch_day;

ALTER TABLE stock_verification_details
  DROP INDEX idx_verification_id;

ALTER TABLE stock_verification_details
  DROP INDEX idx_svd_latest_scan_id;

ALTER TABLE latest_stock_verification
  DROP INDEX idx_lsv_verification_id;

ALTER TABLE products
  DROP INDEX idx_products_batch_id;

ALTER TABLE products
  DROP INDEX idx_products_batch_product;

-- 7) Helpful composite index for same-branch batch diff queries
CREATE INDEX idx_isa_batch_prev_batch
  ON inventory_sales_audit (batch_id, previous_batch_id);
