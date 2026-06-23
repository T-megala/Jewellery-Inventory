-- Dashboard widget permissions (flat module rows).
-- Superseded by 029_permissions_parent_child.sql (parent/child hierarchy).
INSERT INTO permissions (name, module, action, description)
SELECT seed.name, seed.module, seed.action, seed.description
FROM (
  -- 1. Inventory Overview
  SELECT 'dashboard_inventory.categories' AS name, 'dashboard_inventory' AS module, 'categories' AS action, 'Categories' AS description
  UNION ALL SELECT 'dashboard_inventory.sub_products', 'dashboard_inventory', 'sub_products', 'Sub-products'
  UNION ALL SELECT 'dashboard_inventory.total_items_erp', 'dashboard_inventory', 'total_items_erp', 'Total items (ERP)'
  UNION ALL SELECT 'dashboard_inventory.items_scanned', 'dashboard_inventory', 'items_scanned', 'Items scanned'
  UNION ALL SELECT 'dashboard_inventory.discrepancies', 'dashboard_inventory', 'discrepancies', 'Discrepancies'
  UNION ALL SELECT 'dashboard_inventory.stocktakes_per_month', 'dashboard_inventory', 'stocktakes_per_month', 'Stocktakes / month'

  -- 2. Stock Verification
  UNION ALL SELECT 'dashboard_verification.last_stocktake_findings', 'dashboard_verification', 'last_stocktake_findings', 'Last stocktake findings'
  UNION ALL SELECT 'dashboard_verification.stocktake_history', 'dashboard_verification', 'stocktake_history', 'Stocktake history'

  -- 3. Stock Analytics
  UNION ALL SELECT 'dashboard_analytics.product_mix', 'dashboard_analytics', 'product_mix', 'Product mix by category'
  UNION ALL SELECT 'dashboard_analytics.category_breakdown', 'dashboard_analytics', 'category_breakdown', 'Category breakdown'
  UNION ALL SELECT 'dashboard_analytics.accuracy_trend', 'dashboard_analytics', 'accuracy_trend', 'Accuracy trend'
  UNION ALL SELECT 'dashboard_analytics.counter_accuracy', 'dashboard_analytics', 'counter_accuracy', 'Counter / display accuracy'
  UNION ALL SELECT 'dashboard_analytics.day_wise_sales', 'dashboard_analytics', 'day_wise_sales', 'Day-wise sales — pieces sold'
  UNION ALL SELECT 'dashboard_analytics.counter_split', 'dashboard_analytics', 'counter_split', 'Counter split'
  UNION ALL SELECT 'dashboard_analytics.daily_imports', 'dashboard_analytics', 'daily_imports', 'Daily imports — stock per batch'
  UNION ALL SELECT 'dashboard_analytics.top_sold_products', 'dashboard_analytics', 'top_sold_products', 'Top Sold Products'

  -- 4. Branch
  UNION ALL SELECT 'dashboard_branch.smart_alerts', 'dashboard_branch', 'smart_alerts', 'Smart alerts'
  UNION ALL SELECT 'dashboard_branch.branch_comparison', 'dashboard_branch', 'branch_comparison', 'Multi-branch comparison'
  UNION ALL SELECT 'dashboard_branch.stock_movement', 'dashboard_branch', 'stock_movement', 'Stock movement'
) seed
WHERE NOT EXISTS (
  SELECT 1 FROM permissions p WHERE p.name = seed.name
);

-- Optional: grant all new dashboard widget permissions to Super Admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Super Admin'
  AND p.module IN (
    'dashboard_inventory',
    'dashboard_verification',
    'dashboard_analytics',
    'dashboard_branch'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
