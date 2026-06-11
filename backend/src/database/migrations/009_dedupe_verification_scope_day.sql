DELETE svd
FROM stock_verification_details svd
INNER JOIN stock_verification sv ON sv.id = svd.verification_id
INNER JOIN (
  SELECT
    verification_day,
    product_name,
    sub_product_name,
    center_name,
    MAX(id) AS keep_id
  FROM stock_verification
  GROUP BY verification_day, product_name, sub_product_name, center_name
  HAVING COUNT(*) > 1
) duplicates
  ON sv.verification_day = duplicates.verification_day
 AND sv.product_name = duplicates.product_name
 AND sv.sub_product_name = duplicates.sub_product_name
 AND sv.center_name = duplicates.center_name
 AND sv.id <> duplicates.keep_id;

DELETE sv
FROM stock_verification sv
INNER JOIN (
  SELECT
    verification_day,
    product_name,
    sub_product_name,
    center_name,
    MAX(id) AS keep_id
  FROM stock_verification
  GROUP BY verification_day, product_name, sub_product_name, center_name
  HAVING COUNT(*) > 1
) duplicates
  ON sv.verification_day = duplicates.verification_day
 AND sv.product_name = duplicates.product_name
 AND sv.sub_product_name = duplicates.sub_product_name
 AND sv.center_name = duplicates.center_name
 AND sv.id <> duplicates.keep_id;

CREATE UNIQUE INDEX uk_verification_scope_day ON stock_verification (
  verification_day,
  product_name,
  sub_product_name,
  center_name
);
