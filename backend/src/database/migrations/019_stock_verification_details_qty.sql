ALTER TABLE stock_verification_details
  ADD COLUMN expected_qty DECIMAL(12, 3) NOT NULL DEFAULT 0 AFTER item_description;

ALTER TABLE stock_verification_details
  ADD COLUMN scanned_qty INT NOT NULL DEFAULT 0 AFTER expected_qty;

ALTER TABLE stock_verification_details
  ADD COLUMN found_qty INT NOT NULL DEFAULT 0 AFTER scanned_qty;

ALTER TABLE stock_verification_details
  ADD COLUMN missing_qty DECIMAL(12, 3) NOT NULL DEFAULT 0 AFTER found_qty;

CREATE INDEX idx_svd_status_tag ON stock_verification_details (status, tag_no);

