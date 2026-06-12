-- Simplified product schema: Barcode, Item Description, Closing Bal.Qty only.

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS products;

CREATE TABLE products (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_id INT NULL,
  barcode VARCHAR(255) NOT NULL,
  item_description VARCHAR(500) NOT NULL,
  closing_bal_qty DECIMAL(12, 3) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_products_batch_id (batch_id),
  INDEX idx_products_barcode (barcode),
  UNIQUE INDEX uk_batch_barcode (batch_id, barcode),
  CONSTRAINT fk_products_batch_id FOREIGN KEY (batch_id) REFERENCES product_upload_batches(id) ON DELETE SET NULL
);

SET FOREIGN_KEY_CHECKS = 1;
