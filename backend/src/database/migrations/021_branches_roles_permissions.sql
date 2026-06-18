-- Branch master, roles, permissions (no code columns — name is the identifier).

CREATE TABLE IF NOT EXISTS branches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  address VARCHAR(500) NULL,
  city VARCHAR(100) NULL,
  phone VARCHAR(30) NULL,
  is_main TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_branches_name (name),
  INDEX idx_branches_active (is_active)
);

CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_roles_name (name)
);

CREATE TABLE IF NOT EXISTS permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  module VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  description VARCHAR(255) NULL,
  UNIQUE KEY uk_permissions_name (name),
  INDEX idx_permissions_module (module)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

ALTER TABLE users
  ADD COLUMN role_id INT NULL,
  ADD COLUMN branch_id INT NULL,
  ADD COLUMN full_name VARCHAR(150) NULL,
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN last_login_at DATETIME NULL;

ALTER TABLE users
  ADD CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL;

ALTER TABLE users
  ADD CONSTRAINT fk_users_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE product_upload_batches
  ADD COLUMN branch_id INT NULL,
  ADD INDEX idx_batches_branch_active (branch_id, is_active);

ALTER TABLE product_upload_batches
  ADD CONSTRAINT fk_batches_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE stock_verification
  ADD COLUMN branch_id INT NULL,
  ADD INDEX idx_sv_branch_day (branch_id, verification_day);

ALTER TABLE stock_verification
  ADD CONSTRAINT fk_sv_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

INSERT INTO branches (name, is_main, is_active)
SELECT 'Mylapore', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM branches WHERE name = 'Mylapore');

INSERT INTO roles (name, description, is_system, is_active)
SELECT 'Super Admin', 'Full system access', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Super Admin');

INSERT INTO roles (name, description, is_system, is_active)
SELECT 'Branch Manager', 'Manage branch inventory and reports', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Branch Manager');

INSERT INTO roles (name, description, is_system, is_active)
SELECT 'Stock Verifier', 'Upload and view stock verification', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Stock Verifier');

INSERT INTO roles (name, description, is_system, is_active)
SELECT 'Viewer', 'Read-only access', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Viewer');

INSERT INTO permissions (name, module, action, description)
SELECT seed.name, seed.module, seed.action, seed.description
FROM (
  SELECT 'dashboard.view' AS name, 'dashboard' AS module, 'view' AS action, 'View dashboard' AS description
  UNION ALL SELECT 'products.view', 'products', 'view', 'View products'
  UNION ALL SELECT 'products.import', 'products', 'import', 'Import products'
  UNION ALL SELECT 'batches.view', 'batches', 'view', 'View product batches'
  UNION ALL SELECT 'stock_verification.upload', 'stock_verification', 'upload', 'Upload stock verification scans'
  UNION ALL SELECT 'stock_verification.report', 'stock_verification', 'report', 'View stock verification reports'
  UNION ALL SELECT 'stock_verification.export', 'stock_verification', 'export', 'Export stock verification reports'
  UNION ALL SELECT 'users.view', 'users', 'view', 'View users'
  UNION ALL SELECT 'users.manage', 'users', 'manage', 'Create and update users'
  UNION ALL SELECT 'branches.view', 'branches', 'view', 'View branches'
  UNION ALL SELECT 'branches.manage', 'branches', 'manage', 'Manage branches'
  UNION ALL SELECT 'branches.view_all', 'branches', 'view_all', 'View all branches data'
  UNION ALL SELECT 'roles.view', 'roles', 'view', 'View roles'
  UNION ALL SELECT 'roles.manage', 'roles', 'manage', 'Manage roles and permissions'
) seed
WHERE NOT EXISTS (
  SELECT 1 FROM permissions p WHERE p.name = seed.name
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Super Admin'
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
INNER JOIN permissions p ON p.name IN (
  'dashboard.view',
  'products.view',
  'products.import',
  'batches.view',
  'stock_verification.upload',
  'stock_verification.report',
  'stock_verification.export'
)
WHERE r.name = 'Branch Manager'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
INNER JOIN permissions p ON p.name IN (
  'dashboard.view',
  'stock_verification.upload',
  'stock_verification.report'
)
WHERE r.name = 'Stock Verifier'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
INNER JOIN permissions p ON p.name IN (
  'dashboard.view',
  'products.view',
  'batches.view',
  'stock_verification.report'
)
WHERE r.name = 'Viewer'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

UPDATE product_upload_batches b
INNER JOIN branches br ON br.is_main = 1
SET b.branch_id = br.id
WHERE b.branch_id IS NULL;

UPDATE stock_verification sv
INNER JOIN branches br ON br.is_main = 1
SET sv.branch_id = br.id
WHERE sv.branch_id IS NULL;

UPDATE users u
INNER JOIN (
  SELECT id FROM users ORDER BY id ASC LIMIT 1
) first_user ON first_user.id = u.id
INNER JOIN roles r ON r.name = 'Super Admin'
INNER JOIN branches b ON b.is_main = 1
SET u.role_id = r.id,
    u.branch_id = b.id
WHERE u.role_id IS NULL;
