import ApiError from "./ApiError.js";
import { PERMISSIONS } from "../constants/permissions.js";
import branchService from "../services/branchService.js";
import { getBranchIdsForUser } from "../services/userBranchService.js";
import { getRequestParam } from "./requestParams.js";

const parsePositiveInt = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const normalizeBranchIds = ({
  branchId = null,
  branchIds = null,
} = {}) => {
  if (Array.isArray(branchIds) && branchIds.length > 0) {
    return [
      ...new Set(
        branchIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];
  }

  const single = Number(branchId);
  if (Number.isInteger(single) && single > 0) {
    return [single];
  }

  return [];
};

export const buildBranchSqlFilter = (
  column,
  branchIds,
  { keyword = "AND" } = {},
) => {
  const ids = normalizeBranchIds({ branchIds });

  if (ids.length === 0) {
    return {
      clause: keyword === "WHERE" ? "WHERE 1 = 0" : "AND 1 = 0",
      params: [],
    };
  }

  if (ids.length === 1) {
    return keyword === "WHERE"
      ? { clause: `WHERE ${column} = ?`, params: [ids[0]] }
      : { clause: `AND ${column} = ?`, params: [ids[0]] };
  }

  const placeholders = ids.map(() => "?").join(", ");

  return keyword === "WHERE"
    ? { clause: `WHERE ${column} IN (${placeholders})`, params: ids }
    : { clause: `AND ${column} IN (${placeholders})`, params: ids };
};

const getSessionBranchIds = (req) => {
  const fromToken = Array.isArray(req.user?.branchIds)
    ? req.user.branchIds.map((id) => Number(id)).filter((id) => id > 0)
    : [];

  if (fromToken.length > 0) {
    return fromToken;
  }

  const single = parsePositiveInt(req.user?.branchId);
  return single ? [single] : [];
};

const getAssignedBranchIds = async (req) => {
  if (req.user?.id) {
    const fromDb = await getBranchIdsForUser(req.user.id);
    if (fromDb.length > 0) {
      return fromDb;
    }
  }

  const fromToken = Array.isArray(req.user?.branchIds)
    ? req.user.branchIds.map((id) => Number(id)).filter((id) => id > 0)
    : [];

  if (fromToken.length > 0) {
    return fromToken;
  }

  const single = parsePositiveInt(req.user?.branchId);
  return single ? [single] : [];
};

/** Branch scope from token branchIds, or optional single-branch filter from query/header. */
export const resolveRequestBranchIds = async (req) => {
  const permissions = Array.isArray(req.user?.permissions)
    ? req.user.permissions
    : [];
  const canViewAll = permissions.includes(PERMISSIONS.BRANCHES_VIEW_ALL);

  const requestedBranchId =
    parsePositiveInt(req.branchId) ??
    parsePositiveInt(getRequestParam(req, "branchId")) ??
    parsePositiveInt(req.headers?.["x-branch-id"]);

  let sessionBranchIds = getSessionBranchIds(req);
  const assignedBranchIds = await getAssignedBranchIds(req);

  if (sessionBranchIds.length === 0) {
    sessionBranchIds = assignedBranchIds;
  }

  if (sessionBranchIds.length === 0 && canViewAll) {
    const allBranches = await branchService.getAllBranches();
    sessionBranchIds = allBranches.map((branch) => branch.id);
  }

  if (sessionBranchIds.length === 0) {
    throw new ApiError(403, "Branch is not assigned to this user");
  }

  if (requestedBranchId) {
    if (!canViewAll && !assignedBranchIds.includes(requestedBranchId)) {
      throw new ApiError(403, "Branch is not assigned to this user");
    }

    if (!sessionBranchIds.includes(requestedBranchId)) {
      throw new ApiError(403, "Branch is not assigned to this user");
    }

    return [requestedBranchId];
  }

  return sessionBranchIds;
};

/** Android/public dropdowns: require explicit branchId (no auth token). */
export const resolveAndroidBranchIds = async (req) => {
  const branchId =
    parsePositiveInt(req.branchId) ??
    parsePositiveInt(getRequestParam(req, "branchId")) ??
    parsePositiveInt(req.headers?.["x-branch-id"]);

  if (!branchId) {
    throw new ApiError(400, "branchId is required");
  }

  const branch = await branchService.getBranchById(branchId);

  if (!branch) {
    throw new ApiError(404, "Branch not found");
  }

  return [branchId];
};

/** Dropdown APIs: token session scope, or explicit branchId when unauthenticated. */
export const resolveDropdownBranchIds = async (req) => {
  if (req.user?.id || req.user?.sub) {
    return resolveRequestBranchIds(req);
  }

  return resolveAndroidBranchIds(req);
};

export const activeBranchProductsJoin = (batchAlias = "pub") => `
  FROM products p
  INNER JOIN product_upload_batches ${batchAlias}
    ON ${batchAlias}.id = p.batch_id
   AND ${batchAlias}.is_active = 1
`;

export const activeBranchProductsWhere = `
  p.product IS NOT NULL
  AND TRIM(p.product) != ''
`;

export const activeBranchProductsFrom = (batchAlias = "pub") => `
  ${activeBranchProductsJoin(batchAlias)}
  WHERE ${activeBranchProductsWhere}
`;
