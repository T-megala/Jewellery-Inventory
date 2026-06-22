-- Per-product verification summary (one row per inventory barcode/product).

CREATE TABLE IF NOT EXISTS stock_verification_product_summary (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  verification_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  barcode VARCHAR(255) NOT NULL,
  item_description VARCHAR(500) NOT NULL,
  expected_qty DECIMAL(12, 3) NOT NULL DEFAULT 0,
  found_qty DECIMAL(12, 3) NOT NULL DEFAULT 0,
  missing_qty DECIMAL(12, 3) NOT NULL DEFAULT 0,
  verification_percentage DECIMAL(6, 2) NOT NULL DEFAULT 0,
  verification_status ENUM(
    'FULLY_VERIFIED',
    'PARTIALLY_VERIFIED',
    'NOT_VERIFIED'
  ) NOT NULL DEFAULT 'NOT_VERIFIED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_verification_product (verification_id, product_id),
  INDEX idx_verification_id (verification_id),
  INDEX idx_verification_status (verification_id, verification_status),
  INDEX idx_verification_barcode (verification_id, barcode),
  CONSTRAINT fk_svps_verification
    FOREIGN KEY (verification_id) REFERENCES stock_verification(id) ON DELETE CASCADE,
  CONSTRAINT fk_svps_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

ALTER TABLE stock_verification
  ADD COLUMN total_products INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN fully_verified_products INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN partially_verified_products INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN not_verified_products INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN overall_verification_percentage DECIMAL(6, 2) NOT NULL DEFAULT 0;
