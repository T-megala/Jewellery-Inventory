import ApiError from "../utils/ApiError.js";
import { PERMISSIONS, BRANCH_SCOPE_EXEMPT_PATHS } from "../constants/permissions.js";
import branchService from "../services/branchService.js";

const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const isExemptPath = (path) =>
  BRANCH_SCOPE_EXEMPT_PATHS.some((prefix) => path.startsWith(prefix));

const getUserBranchIds = (req) => {
  const fromToken = Array.isArray(req.user?.branchIds)
    ? req.user.branchIds.map((id) => Number(id)).filter((id) => id > 0)
    : [];

  if (fromToken.length > 0) {
    return fromToken;
  }

  const single = parsePositiveInt(req.user?.branchId);
  return single ? [single] : [];
};

export const resolveBranchScope = async (req, res, next) => {
  if (isExemptPath(req.path)) {
    return next();
  }

  const permissions = Array.isArray(req.user?.permissions)
    ? req.user.permissions
    : [];
  const canViewAll = permissions.includes(PERMISSIONS.BRANCHES_VIEW_ALL);
  const userBranchIds = getUserBranchIds(req);
  const requestedBranchId = parsePositiveInt(
    req.query?.branchId ?? req.headers["x-branch-id"],
  );

  if (requestedBranchId) {
    if (canViewAll || userBranchIds.includes(requestedBranchId)) {
      req.branchId = requestedBranchId;
      return next();
    }

    return next(new ApiError(403, "Branch is not assigned to this user"));
  }

  const defaultBranchId = parsePositiveInt(req.user?.branchId);

  if (defaultBranchId) {
    req.branchId = defaultBranchId;
    return next();
  }

  if (userBranchIds.length === 1) {
    req.branchId = userBranchIds[0];
    return next();
  }

  if (canViewAll) {
    req.branchId = await branchService.getDefaultBranchId();
    return next();
  }

  return next(new ApiError(403, "Branch is not assigned to this user"));
};

export const authorize =
  (...requiredPermissions) =>
  (req, res, next) => {
    if (!requiredPermissions.length) {
      return next();
    }

    const userPermissions = Array.isArray(req.user?.permissions)
      ? req.user.permissions
      : [];

    const allowed = requiredPermissions.some((permission) =>
      userPermissions.includes(permission),
    );

    if (!allowed) {
      return next(new ApiError(403, "You do not have permission for this action"));
    }

    return next();
  };
