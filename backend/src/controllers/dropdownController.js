import ApiError from "../utils/ApiError.js";
import { resolveDropdownBranchIds } from "../utils/branchScope.js";
import dropdownService from "../services/dropdownService.js";
import userBranchService from "../services/userBranchService.js";
import { getRequestParam } from "../utils/requestParams.js";

const sendSuccess = (res, data, branchIds) => {
  res.status(200).json({
    success: true,
    message: "Dropdown data fetched successfully",
    branchIds,
    branchId: branchIds.length === 1 ? branchIds[0] : null,
    data,
  });
};

export const getProducts = async (req, res) => {
  const branchIds = await resolveDropdownBranchIds(req);
  const data = await dropdownService.getProducts({
    branchIds,
    includeAllProductsOption: false,
  });
  sendSuccess(res, data, branchIds);
};

export const getSubProducts = async (req, res) => {
  const productName = getRequestParam(req, "productName", "product");
  const branchIds = await resolveDropdownBranchIds(req);

  if (!productName) {
    throw new ApiError(
      400,
      'Parameter "productName" is required in query or body',
    );
  }

  const data = await dropdownService.getSubProducts(productName, {
    branchIds,
    includeAllSubProductsOption: false,
  });
  sendSuccess(res, data, branchIds);
};

export const getCenters = async (req, res) => {
  const productName = getRequestParam(req, "productName", "product");
  const subProductName = getRequestParam(req, "subProductName", "subProduct");
  const branchIds = await resolveDropdownBranchIds(req);

  if (!productName) {
    throw new ApiError(
      400,
      'Parameter "productName" is required in query or body',
    );
  }

  if (!subProductName) {
    throw new ApiError(
      400,
      'Parameter "subProductName" is required in query or body',
    );
  }

  const data = await dropdownService.getCenters(productName, subProductName, {
    branchIds,
    includeAllCentersOption: false,
  });
  sendSuccess(res, data, branchIds);
};

/** Mapped branches for the logged-in user (user_branches). No branches.view permission. */
export const getBranches = async (req, res) => {
  const userId = Number(req.user?.id ?? req.user?.sub);

  if (!userId) {
    throw new ApiError(401, "Authentication required");
  }

  const branches = await userBranchService.getBranchesForUser(userId);

  res.status(200).json({
    success: true,
    message: "Dropdown data fetched successfully",
    data: branches.map(({ id, name, isDefault }) => ({
      id,
      name,
      isDefault,
    })),
  });
};
