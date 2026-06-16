CREATE TABLE IF NOT EXISTS latest_stock_verification (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  verification_id BIGINT NOT NULL,
  verification_date DATETIME NOT NULL,
  verification_day DATE NOT NULL,
  verification_millis BIGINT NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  sub_product_name VARCHAR(255) NOT NULL,
  center_name VARCHAR(255) NOT NULL,
  total_expected INT NOT NULL DEFAULT 0,
  total_scanned INT NOT NULL DEFAULT 0,
  found_count INT NOT NULL DEFAULT 0,
  missing_count INT NOT NULL DEFAULT 0,
  new_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lsv_verification_id (verification_id),
  INDEX idx_lsv_created_at (created_at DESC),
  INDEX idx_lsv_day_scope (
    verification_day,
    product_name,
    sub_product_name,
    center_name
  ),
  CONSTRAINT fk_lsv_verification
    FOREIGN KEY (verification_id) REFERENCES stock_verification(id)
);

ALTER TABLE stock_verification_details
  ADD COLUMN latest_scan_id BIGINT NULL AFTER verification_id;

ALTER TABLE stock_verification_details
  ADD INDEX idx_svd_latest_scan_id (latest_scan_id);

ALTER TABLE stock_verification_details
  ADD CONSTRAINT fk_svd_latest_scan
    FOREIGN KEY (latest_scan_id) REFERENCES latest_stock_verification(id);
