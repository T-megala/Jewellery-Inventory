-- Drop legacy users.branch_id; branch mapping lives in user_branches only.

ALTER TABLE users DROP FOREIGN KEY fk_users_branch;

ALTER TABLE users DROP COLUMN branch_id;
