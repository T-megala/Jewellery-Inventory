-- Seed Admin role: full permissions like Super Admin for operations,
-- but Super Admin users/roles remain hidden from Admin via app checks.
-- Admin users auto-receive all branches (same mapping pattern as Super Admin).

INSERT INTO roles (name, description, is_system, is_active)
SELECT 'Admin', 'Full operational access across all branches', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Admin');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Admin'
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Map every existing Admin user to all branches (non-default).
INSERT INTO user_branches (user_id, branch_id, is_default)
SELECT u.id, b.id, 0
FROM users u
INNER JOIN roles r ON r.id = u.role_id AND r.name = 'Admin'
CROSS JOIN branches b
WHERE u.is_active = 1
  AND NOT EXISTS (
    SELECT 1
    FROM user_branches ub
    WHERE ub.user_id = u.id AND ub.branch_id = b.id
  );

-- Ensure each Admin has a default branch when they have mappings but no default.
UPDATE user_branches ub
INNER JOIN (
  SELECT ub2.user_id, MIN(ub2.branch_id) AS first_branch_id
  FROM user_branches ub2
  INNER JOIN users u ON u.id = ub2.user_id
  INNER JOIN roles r ON r.id = u.role_id AND r.name = 'Admin'
  WHERE NOT EXISTS (
    SELECT 1
    FROM user_branches ub3
    WHERE ub3.user_id = ub2.user_id AND ub3.is_default = 1
  )
  GROUP BY ub2.user_id
) missing ON missing.user_id = ub.user_id AND missing.first_branch_id = ub.branch_id
SET ub.is_default = 1;
