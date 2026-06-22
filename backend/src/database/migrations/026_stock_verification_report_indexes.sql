-- Indexes to speed up stock verification report queries.

CREATE INDEX idx_lsv_verification_id_id
  ON latest_stock_verification (verification_id, id);

CREATE INDEX idx_svd_latest_scan_status_tag
  ON stock_verification_details (latest_scan_id, status, tag_no);

CREATE INDEX idx_svd_verification_status_tag
  ON stock_verification_details (verification_id, status, tag_no);

CREATE INDEX idx_sv_branch_day_date
  ON stock_verification (branch_id, verification_day, verification_date);
