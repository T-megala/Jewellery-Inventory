INSERT INTO latest_stock_verification (
  verification_id,
  verification_date,
  verification_day,
  verification_millis,
  product_name,
  sub_product_name,
  center_name,
  total_expected,
  total_scanned,
  found_count,
  missing_count,
  new_count,
  created_at
)
SELECT
  sv.id,
  sv.verification_date,
  sv.verification_day,
  sv.verification_millis,
  sv.product_name,
  sv.sub_product_name,
  sv.center_name,
  sv.total_expected,
  sv.total_scanned,
  sv.found_count,
  sv.missing_count,
  sv.new_count,
  COALESCE(sv.updated_at, sv.created_at)
FROM stock_verification sv
WHERE NOT EXISTS (
  SELECT 1
  FROM latest_stock_verification lsv
  WHERE lsv.verification_id = sv.id
);

UPDATE stock_verification_details svd
INNER JOIN latest_stock_verification lsv
  ON lsv.verification_id = svd.verification_id
SET svd.latest_scan_id = lsv.id
WHERE svd.latest_scan_id IS NULL;
