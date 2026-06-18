import branchService from "../services/branchService.js";

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
