CREATE TABLE IF NOT EXISTS user_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  refresh_token_hash CHAR(64) NOT NULL,
  selected_branch_ids JSON NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  last_used_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_logs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_user_logs_refresh_hash (refresh_token_hash),
  INDEX idx_user_logs_user_active (user_id, revoked_at, expires_at)
);
