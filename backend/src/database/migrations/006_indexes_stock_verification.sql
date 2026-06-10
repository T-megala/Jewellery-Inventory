CREATE INDEX idx_verification_date ON stock_verification (verification_date);

CREATE INDEX idx_verification_created_at ON stock_verification (created_at);

CREATE INDEX idx_verification_id ON stock_verification_details (verification_id);

CREATE INDEX idx_status ON stock_verification_details (status);

CREATE INDEX idx_tag_no ON stock_verification_details (tag_no);

CREATE INDEX idx_product_name ON stock_verification_details (product_name);

CREATE INDEX idx_sub_product_name ON stock_verification_details (sub_product_name);

CREATE INDEX idx_center_name ON stock_verification_details (center_name);

CREATE INDEX idx_svd_verification_status ON stock_verification_details (verification_id, status);

ALTER TABLE stock_verification_details
  ADD CONSTRAINT fk_svd_verification
    FOREIGN KEY (verification_id) REFERENCES stock_verification(id);
