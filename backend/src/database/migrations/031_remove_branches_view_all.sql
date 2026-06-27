DELETE rp
FROM role_permissions rp
INNER JOIN permissions p ON p.id = rp.permission_id
WHERE p.name = 'branches.view_all';

DELETE FROM permissions
WHERE name = 'branches.view_all';
