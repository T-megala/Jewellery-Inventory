CREATE UNIQUE INDEX uk_batch_tag ON products (batch_id, tag_packet_no);

CREATE INDEX idx_tag_packet_no ON products (tag_packet_no);

CREATE INDEX idx_products_batch_id ON products (batch_id);

CREATE INDEX idx_products_batch_product ON products (batch_id, product);

CREATE INDEX idx_products_batch_product_sub ON products (batch_id, product, sub_product);

CREATE INDEX idx_products_product ON products (product);
