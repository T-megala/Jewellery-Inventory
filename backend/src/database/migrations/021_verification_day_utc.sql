-- Normalize verification_day and verification_date from client verification_millis (UTC).

SET time_zone = '+00:00';

DELETE svd
FROM stock_verification_details svd
INNER JOIN stock_verification sv ON sv.id = svd.verification_id
INNER JOIN stock_verification newer ON
  DATE(FROM_UNIXTIME(FLOOR(newer.verification_millis / 1000)))
    = DATE(FROM_UNIXTIME(FLOOR(sv.verification_millis / 1000)))
  AND newer.id > sv.id
WHERE sv.verification_millis > 0
  AND newer.verification_millis > 0;

DELETE svps
FROM stock_verification_product_summary svps
INNER JOIN stock_verification sv ON sv.id = svps.verification_id
INNER JOIN stock_verification newer ON
  DATE(FROM_UNIXTIME(FLOOR(newer.verification_millis / 1000)))
    = DATE(FROM_UNIXTIME(FLOOR(sv.verification_millis / 1000)))
  AND newer.id > sv.id
WHERE sv.verification_millis > 0
  AND newer.verification_millis > 0;

DELETE sv
FROM stock_verification sv
INNER JOIN stock_verification newer ON
  DATE(FROM_UNIXTIME(FLOOR(newer.verification_millis / 1000)))
    = DATE(FROM_UNIXTIME(FLOOR(sv.verification_millis / 1000)))
  AND newer.id > sv.id
WHERE sv.verification_millis > 0
  AND newer.verification_millis > 0;

UPDATE stock_verification
SET
  verification_date = FROM_UNIXTIME(FLOOR(verification_millis / 1000)),
  verification_day = DATE(FROM_UNIXTIME(FLOOR(verification_millis / 1000)))
WHERE verification_millis IS NOT NULL
  AND verification_millis > 0;

ALTER TABLE stock_verification_product_summary
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
