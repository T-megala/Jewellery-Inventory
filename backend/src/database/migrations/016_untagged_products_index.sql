CREATE INDEX idx_products_batch_untagged_line ON products (
  batch_id,
  tran_no,
  product,
  sub_product,
  counter_name
);
