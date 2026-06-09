-- Product upload batch tracking

CREATE TABLE IF NOT EXISTS product_upload_batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_date DATE NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  uploaded_by VARCHAR(100) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  INDEX idx_batch_date (batch_date),
  INDEX idx_is_active (is_active)
);

ALTER TABLE products
  ADD COLUMN batch_id INT NULL,
  ADD CONSTRAINT fk_products_batch
    FOREIGN KEY (batch_id) REFERENCES product_upload_batches(id);

CREATE UNIQUE INDEX uk_batch_tag ON products (batch_id, tag_packet_no);
CREATE INDEX idx_tag_packet_no ON products (tag_packet_no);
