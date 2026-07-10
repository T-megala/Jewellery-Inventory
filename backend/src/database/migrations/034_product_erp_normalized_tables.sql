CREATE TABLE IF NOT EXISTS product_master (
  product_id INT NOT NULL PRIMARY KEY,
  category VARCHAR(100) NULL,
  product_design VARCHAR(150) NULL,
  collection_name VARCHAR(100) NULL,
  brand VARCHAR(100) NULL,
  gender VARCHAR(50) NULL,
  occasion VARCHAR(100) NULL,
  metal VARCHAR(100) NULL,
  purity VARCHAR(50) NULL,
  hsn_code VARCHAR(20) NULL,
  uom VARCHAR(30) NULL,
  product_code VARCHAR(100) NULL,
  description TEXT NULL,
  remarks TEXT NULL,
  certification_number VARCHAR(100) NULL,
  hallmark_number VARCHAR(100) NULL,
  image_url VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_product_master_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_inventory (
  product_id INT NOT NULL PRIMARY KEY,
  company VARCHAR(150) NULL,
  branch_name VARCHAR(150) NULL,
  warehouse VARCHAR(100) NULL,
  location VARCHAR(100) NULL,
  stock_status VARCHAR(50) NULL,
  lot_number VARCHAR(100) NULL,
  supplier VARCHAR(150) NULL,
  supplier_invoice_number VARCHAR(100) NULL,
  purchase_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_product_inventory_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_pricing (
  product_id INT NOT NULL PRIMARY KEY,
  gold_rate DECIMAL(14, 2) NULL,
  making_charge DECIMAL(14, 2) NULL,
  making_charge_type VARCHAR(50) NULL,
  wastage_percentage DECIMAL(8, 3) NULL,
  wastage_amount DECIMAL(14, 2) NULL,
  stone_amount DECIMAL(14, 2) NULL,
  diamond_amount DECIMAL(14, 2) NULL,
  labour_charge DECIMAL(14, 2) NULL,
  purchase_cost DECIMAL(14, 2) NULL,
  selling_price DECIMAL(14, 2) NULL,
  gst_percentage DECIMAL(8, 3) NULL,
  gst_amount DECIMAL(14, 2) NULL,
  less_weight DECIMAL(10, 3) NULL,
  thread_weight DECIMAL(10, 3) NULL,
  supplier_deduction_weight DECIMAL(10, 3) NULL,
  stone_weight DECIMAL(10, 3) NULL,
  diamond_weight DECIMAL(10, 3) NULL,
  other_metal_weight DECIMAL(10, 3) NULL,
  diamond_pieces INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_product_pricing_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_tag_details (
  product_id INT NOT NULL PRIMARY KEY,
  tag_no VARCHAR(100) NULL,
  barcode VARCHAR(100) NULL,
  rfid VARCHAR(100) NULL,
  qr_code VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_product_tag_details_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX idx_product_tag_details_barcode ON product_tag_details (barcode);

CREATE INDEX idx_product_tag_details_rfid ON product_tag_details (rfid);

CREATE INDEX idx_product_inventory_lot_number ON product_inventory (lot_number);

CREATE INDEX idx_product_master_product_code ON product_master (product_code);
