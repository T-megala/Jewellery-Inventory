-- Split users/branches/roles .manage into .add, .update, .delete

INSERT INTO permissions (name, module, action, description)
SELECT seed.name, seed.module, seed.action, seed.description
FROM (
  SELECT 'users.add' AS name, 'users' AS module, 'add' AS action, 'Create users' AS description
  UNION ALL SELECT 'users.update', 'users', 'update', 'Update users'
  UNION ALL SELECT 'users.delete', 'users', 'delete', 'Delete users'
  UNION ALL SELECT 'branches.add', 'branches', 'add', 'Create branches'
  UNION ALL SELECT 'branches.update', 'branches', 'update', 'Update branches'
  UNION ALL SELECT 'branches.delete', 'branches', 'delete', 'Delete branches'
  UNION ALL SELECT 'roles.add', 'roles', 'add', 'Create roles'
  UNION ALL SELECT 'roles.update', 'roles', 'update', 'Update roles'
  UNION ALL SELECT 'roles.delete', 'roles', 'delete', 'Delete roles'
) seed
WHERE NOT EXISTS (
  SELECT 1 FROM permissions p WHERE p.name = seed.name
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM role_permissions rp
INNER JOIN permissions op ON op.id = rp.permission_id AND op.name = 'users.manage'
INNER JOIN permissions np ON np.name IN ('users.add', 'users.update', 'users.delete')
WHERE NOT EXISTS (
  SELECT 1
  FROM role_permissions existing
  WHERE existing.role_id = rp.role_id AND existing.permission_id = np.id
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM role_permissions rp
INNER JOIN permissions op ON op.id = rp.permission_id AND op.name = 'branches.manage'
INNER JOIN permissions np ON np.name IN ('branches.add', 'branches.update', 'branches.delete')
WHERE NOT EXISTS (
  SELECT 1
  FROM role_permissions existing
  WHERE existing.role_id = rp.role_id AND existing.permission_id = np.id
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM role_permissions rp
INNER JOIN permissions op ON op.id = rp.permission_id AND op.name = 'roles.manage'
INNER JOIN permissions np ON np.name IN ('roles.add', 'roles.update', 'roles.delete')
WHERE NOT EXISTS (
  SELECT 1
  FROM role_permissions existing
  WHERE existing.role_id = rp.role_id AND existing.permission_id = np.id
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
INNER JOIN permissions p ON p.name IN (
  'users.add', 'users.update', 'users.delete',
  'branches.add', 'branches.update', 'branches.delete',
  'roles.add', 'roles.update', 'roles.delete'
)
WHERE r.name = 'Super Admin'
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

DELETE FROM role_permissions
WHERE permission_id IN (
  SELECT id FROM (
    SELECT id FROM permissions
    WHERE name IN ('users.manage', 'branches.manage', 'roles.manage')
  ) AS legacy_permissions
);

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM permissions
WHERE name IN ('users.manage', 'branches.manage', 'roles.manage');

SET FOREIGN_KEY_CHECKS = 1;
