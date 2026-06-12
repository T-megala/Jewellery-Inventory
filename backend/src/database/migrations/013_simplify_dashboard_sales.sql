-- Dashboard sales tracking for simplified product schema (barcode, item_description, closing_bal_qty).

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS inventory_sales_audit;

CREATE TABLE inventory_sales_audit (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_id INT NOT NULL,
  previous_batch_id INT NOT NULL,
  barcode VARCHAR(255) NOT NULL,
  item_description VARCHAR(500) NULL,
  sale_type ENUM('BARCODE_REMOVED', 'QTY_REDUCTION') NOT NULL,
  previous_qty DECIMAL(12, 3) NULL,
  current_qty DECIMAL(12, 3) NULL,
  sold_qty DECIMAL(12, 3) NOT NULL DEFAULT 0,
  sold_barcodes TINYINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_isa_batch_id (batch_id),
  INDEX idx_isa_previous_batch_id (previous_batch_id),
  INDEX idx_isa_batch_item (batch_id, item_description(100))
);

DELETE FROM daily_sales_summary;

SET FOREIGN_KEY_CHECKS = 1;
