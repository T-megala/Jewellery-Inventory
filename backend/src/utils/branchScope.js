import ApiError from "./ApiError.js";
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

const getAssignedBranchIds = async (req) => {
  const userId = req.user?.id ?? parsePositiveInt(req.user?.sub);

  if (!userId) {
    return [];
  }

  return getBranchIdsForUser(userId);
};

/** Branch scope from user_branches (DB), or optional single-branch filter from query/header. */
export const resolveRequestBranchIds = async (req) => {
  const requestedBranchId =
    parsePositiveInt(req.branchId) ??
    parsePositiveInt(getRequestParam(req, "branchId")) ??
    parsePositiveInt(req.headers?.["x-branch-id"]);

  const sessionBranchIds = await getAssignedBranchIds(req);

  if (sessionBranchIds.length === 0) {
    throw new ApiError(403, "Branch is not assigned to this user");
  }

  if (requestedBranchId) {
    if (!sessionBranchIds.includes(requestedBranchId)) {
      throw new ApiError(403, "Branch is not assigned to this user");
    }

    return [requestedBranchId];
  }

  return sessionBranchIds;
};

/** All assigned branches for multi-branch comparison (ignores branchId filter). */
export const resolveComparisonBranchIds = async (req) => {
  const sessionBranchIds = await getAssignedBranchIds(req);

  if (sessionBranchIds.length === 0) {
    throw new ApiError(403, "Branch is not assigned to this user");
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

/** Dropdown APIs: DB branch scope, or explicit branchId when unauthenticated. */
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
