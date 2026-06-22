CREATE UNIQUE INDEX uk_batch_barcode ON products (batch_id, barcode);

CREATE INDEX idx_products_barcode ON products (barcode);

CREATE INDEX idx_products_batch_id ON products (batch_id);
