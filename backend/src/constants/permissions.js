export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  PRODUCTS_VIEW: "products.view",
  PRODUCTS_IMPORT: "products.import",
  BATCHES_VIEW: "batches.view",
  STOCK_VERIFICATION_UPLOAD: "stock_verification.upload",
  STOCK_VERIFICATION_REPORT: "stock_verification.report",
  STOCK_VERIFICATION_EXPORT: "stock_verification.export",
  USERS_VIEW: "users.view",
  USERS_ADD: "users.add",
  USERS_UPDATE: "users.update",
  USERS_DELETE: "users.delete",
  BRANCHES_VIEW: "branches.view",
  BRANCHES_ADD: "branches.add",
  BRANCHES_UPDATE: "branches.update",
  BRANCHES_DELETE: "branches.delete",
  BRANCHES_VIEW_ALL: "branches.view_all",
  ROLES_VIEW: "roles.view",
  ROLES_ADD: "roles.add",
  ROLES_UPDATE: "roles.update",
  ROLES_DELETE: "roles.delete",
};

export const ALL_PERMISSION_NAMES = Object.values(PERMISSIONS);

export const BRANCH_SCOPE_EXEMPT_PATHS = [
  "/branches",
  "/roles",
  "/permissions",
  "/users",
  "/auth",
];
