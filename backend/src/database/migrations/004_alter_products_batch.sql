ALTER TABLE products
  ADD COLUMN batch_id INT NULL;

ALTER TABLE products
  ADD CONSTRAINT fk_products_batch
    FOREIGN KEY (batch_id) REFERENCES product_upload_batches(id);
