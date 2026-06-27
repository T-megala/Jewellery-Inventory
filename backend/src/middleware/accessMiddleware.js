import ApiError from "../utils/ApiError.js";
import { BRANCH_SCOPE_EXEMPT_PATHS } from "../constants/permissions.js";
import { getBranchIdsForUser } from "../services/userBranchService.js";

const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const isExemptPath = (path) =>
  BRANCH_SCOPE_EXEMPT_PATHS.some((prefix) => path.startsWith(prefix));

const getAssignedBranchIds = async (req) => {
  const userId = req.user?.id ?? parsePositiveInt(req.user?.sub);

  if (!userId) {
    return [];
  }

  return getBranchIdsForUser(userId);
};

export const resolveBranchScope = async (req, res, next) => {
  if (isExemptPath(req.path)) {
    return next();
  }

  const assignedBranchIds = await getAssignedBranchIds(req);

  const requestedBranchId = parsePositiveInt(
    req.query?.branchId ?? req.headers["x-branch-id"],
  );

  if (requestedBranchId) {
    if (!assignedBranchIds.includes(requestedBranchId)) {
      return next(new ApiError(403, "Branch is not assigned to this user"));
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
