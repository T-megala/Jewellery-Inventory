import ApiError from "../utils/ApiError.js";
import {
  PERMISSIONS,
  BRANCH_SCOPE_EXEMPT_PATHS,
} from "../constants/permissions.js";

const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const isExemptPath = (path) =>
  BRANCH_SCOPE_EXEMPT_PATHS.some((prefix) => path.startsWith(prefix));

const getMappedBranchIds = (req) => {
  const fromToken = Array.isArray(req.user?.branchIds)
    ? req.user.branchIds.map((id) => Number(id)).filter((id) => id > 0)
    : [];

  if (fromToken.length > 0) {
    return fromToken;
  }

  const single = parsePositiveInt(req.user?.branchId);
  return single ? [single] : [];
};

const getSelectedBranchIds = (req) => {
  const fromToken = Array.isArray(req.user?.selectedBranchIds)
    ? req.user.selectedBranchIds.map((id) => Number(id)).filter((id) => id > 0)
    : [];

  if (fromToken.length > 0) {
    return fromToken;
  }

  return getMappedBranchIds(req);
};

export const resolveBranchScope = async (req, res, next) => {
  if (isExemptPath(req.path)) {
    return next();
  }

  const permissions = Array.isArray(req.user?.permissions)
    ? req.user.permissions
    : [];
  const canViewAll = permissions.includes(PERMISSIONS.BRANCHES_VIEW_ALL);
  const mappedBranchIds = getMappedBranchIds(req);
  const selectedBranchIds = getSelectedBranchIds(req);
  req.selectedBranchIds = selectedBranchIds;

  const requestedBranchId = parsePositiveInt(
    req.query?.branchId ?? req.headers["x-branch-id"],
  );

  if (requestedBranchId) {
    if (!canViewAll && !mappedBranchIds.includes(requestedBranchId)) {
      return next(new ApiError(403, "Branch is not assigned to this user"));
    }

    if (!selectedBranchIds.includes(requestedBranchId)) {
      return next(
        new ApiError(403, "Branch is not in the current session selection"),
      );
    }

    req.branchId = requestedBranchId;
    return next();
  }

  return next();
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
      return next(
        new ApiError(403, "You do not have permission for this action"),
      );
    }

    return next();
  };
