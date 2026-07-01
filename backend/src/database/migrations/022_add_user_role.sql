-- User role for CEO vs store staff (warehouse/retail/franchise dashboards later).

ALTER TABLE users
  ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user' AFTER password;

CREATE INDEX idx_users_role ON users (role);
