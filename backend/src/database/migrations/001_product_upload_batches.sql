CREATE TABLE IF NOT EXISTS product_upload_batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_date DATE NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  uploaded_by VARCHAR(100) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  INDEX idx_batch_date (batch_date),
  INDEX idx_is_active (is_active)
);
