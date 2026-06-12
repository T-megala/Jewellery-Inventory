-- Stock verification: one session per day, active batch only, barcode + item_description.

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS stock_verification_details;
DROP TABLE IF EXISTS stock_verification;

CREATE TABLE stock_verification (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_id INT NULL,
  verification_date DATETIME NOT NULL,
  verification_day DATE NOT NULL,
  verification_millis BIGINT NOT NULL,
  total_expected INT NOT NULL DEFAULT 0,
  total_scanned INT NOT NULL DEFAULT 0,
  found_count INT NOT NULL DEFAULT 0,
  missing_count INT NOT NULL DEFAULT 0,
  new_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uk_verification_day (verification_day),
  INDEX idx_verification_date (verification_date),
  INDEX idx_sv_batch_id (batch_id),
  CONSTRAINT fk_sv_batch FOREIGN KEY (batch_id) REFERENCES product_upload_batches(id) ON DELETE SET NULL
);

CREATE TABLE stock_verification_details (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  verification_id BIGINT NOT NULL,
  tag_no VARCHAR(100) NOT NULL,
  status ENUM('FOUND', 'MISSING', 'NEW') NOT NULL,
  item_description VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_verification_tag (verification_id, tag_no),
  INDEX idx_verification_id (verification_id),
  INDEX idx_status (status),
  INDEX idx_tag_no (tag_no),
  CONSTRAINT fk_svd_verification FOREIGN KEY (verification_id) REFERENCES stock_verification(id)
);

SET FOREIGN_KEY_CHECKS = 1;
