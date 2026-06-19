-- Remove is_main and is_active from branches.

ALTER TABLE branches DROP INDEX idx_branches_active;

ALTER TABLE branches
  DROP COLUMN is_main,
  DROP COLUMN is_active;
