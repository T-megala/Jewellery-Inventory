-- User ↔ branch mapping (many-to-many). Default branch is is_default = 1 in this table.

CREATE TABLE IF NOT EXISTS user_branches (
  user_id INT NOT NULL,
  branch_id INT NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, branch_id),
  INDEX idx_user_branches_user (user_id),
  INDEX idx_user_branches_branch (branch_id),
  CONSTRAINT fk_user_branches_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_branches_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

INSERT INTO user_branches (user_id, branch_id, is_default)
SELECT u.id, b.id, 1
FROM users u
CROSS JOIN (SELECT MIN(id) AS id FROM branches) b
WHERE b.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM user_branches ub
    WHERE ub.user_id = u.id
  );
