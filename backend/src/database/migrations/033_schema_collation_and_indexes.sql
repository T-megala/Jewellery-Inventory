-- Unify collation, restore users.username uniqueness, drop redundant index.
-- Safe to re-run; migrate.js skips duplicate constraint/index errors.

-- 1) Standardize collation to database default (utf8mb4_0900_ai_ci)
ALTER TABLE daily_sales_summary
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

ALTER TABLE permissions
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

ALTER TABLE product_upload_batches
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

ALTER TABLE products
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

ALTER TABLE role_permissions
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

ALTER TABLE stock_verification
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

ALTER TABLE stock_verification_details
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

ALTER TABLE users
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- 2) Enforce unique login names (original 002 schema; lost on later alters)
ALTER TABLE users
  ADD UNIQUE KEY uk_users_username (username);

-- 3) Redundant index (covered by idx_svd_verification_status_tag)
ALTER TABLE stock_verification_details
  DROP INDEX idx_svd_verification_status;
