-- Per-branch verification sessions and latest-scan tracking.

ALTER TABLE latest_stock_verification
  ADD COLUMN branch_id INT NULL AFTER verification_id;

UPDATE latest_stock_verification lsv
INNER JOIN stock_verification sv ON sv.id = lsv.verification_id
SET lsv.branch_id = sv.branch_id
WHERE lsv.branch_id IS NULL;

UPDATE stock_verification
SET branch_id = (SELECT MIN(id) FROM branches)
WHERE branch_id IS NULL
  AND EXISTS (SELECT 1 FROM branches);

ALTER TABLE stock_verification
  DROP INDEX uk_verification_scope_day;

ALTER TABLE stock_verification
  ADD UNIQUE KEY uk_sv_branch_scope_day (
    branch_id,
    verification_day,
    product_name,
    sub_product_name,
    center_name
  );

CREATE INDEX idx_lsv_branch_day ON latest_stock_verification (branch_id, verification_day);
