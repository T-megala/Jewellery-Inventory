-- Parent/child dashboard permissions

ALTER TABLE permissions
  ADD COLUMN parent_id INT NULL AFTER description;

ALTER TABLE permissions
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER parent_id;

ALTER TABLE permissions
  ADD INDEX idx_permissions_parent (parent_id);

ALTER TABLE permissions
  ADD CONSTRAINT fk_permissions_parent
    FOREIGN KEY (parent_id) REFERENCES permissions(id) ON DELETE CASCADE;

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM permissions
WHERE module IN (
  'dashboard_inventory',
  'dashboard_verification',
  'dashboard_analytics',
  'dashboard_branch'
);

DELETE FROM permissions
WHERE module = 'dashboard'
  AND action = 'group';

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO permissions (name, module, action, description, parent_id, sort_order)
SELECT s.name, s.module, s.action, s.description, NULL, s.sort_order
FROM (
  SELECT 'dashboard.inventory_overview' AS name, 'dashboard' AS module, 'group' AS action, 'Inventory Overview' AS description, 1 AS sort_order
  UNION ALL SELECT 'dashboard.stock_verification', 'dashboard', 'group', 'Stock Verification', 2
  UNION ALL SELECT 'dashboard.stock_analytics', 'dashboard', 'group', 'Stock Analytics', 3
  UNION ALL SELECT 'dashboard.branch', 'dashboard', 'group', 'Branch', 4
) s
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.name = s.name);

INSERT INTO permissions (name, module, action, description, parent_id, sort_order)
SELECT s.name, 'dashboard', s.action, s.description, p.id, s.sort_order
FROM (
  SELECT 'dashboard.inventory_overview.categories' AS name, 'categories' AS action, 'Categories' AS description, 1 AS sort_order
  UNION ALL SELECT 'dashboard.inventory_overview.sub_products', 'sub_products', 'Sub-products', 2
  UNION ALL SELECT 'dashboard.inventory_overview.total_items_erp', 'total_items_erp', 'Total items (ERP)', 3
  UNION ALL SELECT 'dashboard.inventory_overview.items_scanned', 'items_scanned', 'Items scanned', 4
  UNION ALL SELECT 'dashboard.inventory_overview.discrepancies', 'discrepancies', 'Discrepancies', 5
  UNION ALL SELECT 'dashboard.inventory_overview.stocktakes_per_month', 'stocktakes_per_month', 'Stocktakes / month', 6
) s
INNER JOIN permissions p ON p.name = 'dashboard.inventory_overview'
WHERE NOT EXISTS (SELECT 1 FROM permissions x WHERE x.name = s.name);

INSERT INTO permissions (name, module, action, description, parent_id, sort_order)
SELECT s.name, 'dashboard', s.action, s.description, p.id, s.sort_order
FROM (
  SELECT 'dashboard.stock_verification.last_stocktake_findings' AS name, 'last_stocktake_findings' AS action, 'Last stocktake findings' AS description, 1 AS sort_order
  UNION ALL SELECT 'dashboard.stock_verification.stocktake_history', 'stocktake_history', 'Stocktake history', 2
) s
INNER JOIN permissions p ON p.name = 'dashboard.stock_verification'
WHERE NOT EXISTS (SELECT 1 FROM permissions x WHERE x.name = s.name);

INSERT INTO permissions (name, module, action, description, parent_id, sort_order)
SELECT s.name, 'dashboard', s.action, s.description, p.id, s.sort_order
FROM (
  SELECT 'dashboard.stock_analytics.product_mix' AS name, 'product_mix' AS action, 'Product mix by category' AS description, 1 AS sort_order
  UNION ALL SELECT 'dashboard.stock_analytics.category_breakdown', 'category_breakdown', 'Category breakdown', 2
  UNION ALL SELECT 'dashboard.stock_analytics.accuracy_trend', 'accuracy_trend', 'Accuracy trend', 3
  UNION ALL SELECT 'dashboard.stock_analytics.counter_accuracy', 'counter_accuracy', 'Counter / display accuracy', 4
  UNION ALL SELECT 'dashboard.stock_analytics.day_wise_sales', 'day_wise_sales', 'Day-wise sales — pieces sold', 5
  UNION ALL SELECT 'dashboard.stock_analytics.counter_split', 'counter_split', 'Counter split', 6
  UNION ALL SELECT 'dashboard.stock_analytics.daily_imports', 'daily_imports', 'Daily imports — stock per batch', 7
  UNION ALL SELECT 'dashboard.stock_analytics.top_sold_products', 'top_sold_products', 'Top Sold Products', 8
) s
INNER JOIN permissions p ON p.name = 'dashboard.stock_analytics'
WHERE NOT EXISTS (SELECT 1 FROM permissions x WHERE x.name = s.name);

INSERT INTO permissions (name, module, action, description, parent_id, sort_order)
SELECT s.name, 'dashboard', s.action, s.description, p.id, s.sort_order
FROM (
  SELECT 'dashboard.branch.smart_alerts' AS name, 'smart_alerts' AS action, 'Smart alerts' AS description, 1 AS sort_order
  UNION ALL SELECT 'dashboard.branch.branch_comparison', 'branch_comparison', 'Multi-branch comparison', 2
  UNION ALL SELECT 'dashboard.branch.stock_movement', 'stock_movement', 'Stock movement', 3
) s
INNER JOIN permissions p ON p.name = 'dashboard.branch'
WHERE NOT EXISTS (SELECT 1 FROM permissions x WHERE x.name = s.name);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Super Admin'
  AND p.module = 'dashboard'
  AND p.parent_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
