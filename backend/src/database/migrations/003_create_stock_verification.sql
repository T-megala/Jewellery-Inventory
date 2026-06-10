CREATE TABLE IF NOT EXISTS stock_verification (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  verification_date DATETIME NOT NULL,
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
  INDEX idx_verification_date (verification_date),
  INDEX idx_verification_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS stock_verification_details (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  verification_id BIGINT NOT NULL,
  tag_no VARCHAR(100) NOT NULL,
  status ENUM('FOUND', 'MISSING', 'NEW') NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  sub_product_name VARCHAR(255) NOT NULL,
  center_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_verification_id (verification_id),
  INDEX idx_status (status),
  INDEX idx_tag_no (tag_no),
  INDEX idx_product_name (product_name),
  INDEX idx_sub_product_name (sub_product_name),
  INDEX idx_center_name (center_name),
  INDEX idx_svd_verification_status (verification_id, status),
  CONSTRAINT fk_svd_verification
    FOREIGN KEY (verification_id) REFERENCES stock_verification(id)
);
