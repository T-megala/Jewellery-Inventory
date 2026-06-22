import branchService from "../services/branchService.js";
import { getRequestParam } from "./requestParams.js";

const parsePositiveInt = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

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

/** Resolve branch from middleware, query (?branchId=), header (X-Branch-Id), or body. */
export const resolveRequestBranchId = async (req) => {
  const branchId =
    parsePositiveInt(req?.branchId) ??
    parsePositiveInt(getRequestParam(req, "branchId")) ??
    parsePositiveInt(req?.headers?.["x-branch-id"]);

  return resolveOperationalBranchId({
    branchId,
    bodyBranchId: getRequestParam(req, "branchId"),
  });
};
