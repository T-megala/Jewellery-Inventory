CREATE TABLE IF NOT EXISTS erp_product_codes (
  pro_code INT NOT NULL,
  product_name VARCHAR(150) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (pro_code)
);

CREATE INDEX idx_erp_product_codes_name ON erp_product_codes (product_name);

CREATE INDEX idx_erp_product_codes_active ON erp_product_codes (is_active);

ALTER TABLE product_master
  ADD COLUMN erp_pro_code INT NULL AFTER product_code;

CREATE INDEX idx_product_master_erp_pro_code ON product_master (erp_pro_code);
