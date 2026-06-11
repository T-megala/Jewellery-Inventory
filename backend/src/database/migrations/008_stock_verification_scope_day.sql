ALTER TABLE stock_verification
  ADD COLUMN verification_day DATE NULL AFTER verification_date;

ALTER TABLE stock_verification
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL AFTER created_at;

UPDATE stock_verification
SET verification_day = DATE(verification_date)
WHERE verification_day IS NULL;

ALTER TABLE stock_verification
  MODIFY verification_day DATE NOT NULL;
