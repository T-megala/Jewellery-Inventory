import branchService from "../services/branchService.js";
import { resolveRequestBranchIds } from "./branchScope.js";

export const resolveOperationalBranchId = async ({
  branchId = null,
  bodyBranchId = null,
} = {}) => {
  const explicit = Number(branchId ?? bodyBranchId);

  if (Number.isInteger(explicit) && explicit > 0) {
    return explicit;
  }

  return branchService.getDefaultBranchId();
};

/** Resolve a single branch for upload/import operations. */
export const resolveRequestBranchId = async (req) => {
  const branchIds = await resolveRequestBranchIds(req);
  return branchIds[0] ?? null;
};
