CREATE TABLE IF NOT EXISTS daily_sales_summary (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_id INT NOT NULL,
  batch_date DATE NOT NULL,
  counter_name VARCHAR(255) NOT NULL,
  total_stock INT NOT NULL DEFAULT 0,
  estimated_sold INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_batch_date (batch_date),
  INDEX idx_counter (counter_name),
  INDEX idx_batch_id (batch_id),
  UNIQUE KEY uk_batch_counter (batch_id, counter_name)
);
