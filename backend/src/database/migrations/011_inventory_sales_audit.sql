CREATE TABLE IF NOT EXISTS inventory_sales_audit (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_id INT NOT NULL,
  previous_batch_id INT NOT NULL,
  tag_no VARCHAR(255) NOT NULL,
  product VARCHAR(255) NULL,
  sub_product VARCHAR(255) NULL,
  counter_name VARCHAR(255) NOT NULL,
  sale_type ENUM('TAG_REMOVED', 'PIECE_REDUCTION') NOT NULL,
  previous_pieces DECIMAL(12, 3) NULL,
  current_pieces DECIMAL(12, 3) NULL,
  sold_pieces DECIMAL(12, 3) NOT NULL DEFAULT 0,
  sold_tags TINYINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_isa_batch_id (batch_id),
  INDEX idx_isa_previous_batch_id (previous_batch_id),
  INDEX idx_isa_batch_counter (batch_id, counter_name),
  INDEX idx_isa_batch_product (batch_id, product)
);

ALTER TABLE daily_sales_summary
  ADD COLUMN total_stock_pieces INT NOT NULL DEFAULT 0 AFTER total_stock;

ALTER TABLE daily_sales_summary
  ADD COLUMN sold_tags INT NOT NULL DEFAULT 0 AFTER estimated_sold;

ALTER TABLE daily_sales_summary
  ADD COLUMN sold_pieces INT NOT NULL DEFAULT 0 AFTER sold_tags;
