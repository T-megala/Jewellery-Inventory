import ApiError from "../utils/ApiError.js";
import { resolveDropdownBranchIds } from "../utils/branchScope.js";
import productService from "../services/productService.js";
import { getRequestParam } from "../utils/requestParams.js";

const sendSuccess = (res, data) => {
  res.status(200).json({
    success: true,
    message: "Data fetched successfully",
    data,
  });
};

export const getProducts = async (req, res) => {
  const branchIds = await resolveDropdownBranchIds(req);
  const data = await productService.getProductsForBranch(branchIds);
  sendSuccess(res, data);
};

export const getSubProducts = async (req, res) => {
  const product = getRequestParam(req, "product", "productName");
  const branchIds = await resolveDropdownBranchIds(req);

  if (!product) {
    throw new ApiError(
      400,
      'Parameter "product" is required in query or body',
    );
  }

  const data = await productService.getSubProducts(product, branchIds);
  sendSuccess(res, data);
};

export const getCenters = async (req, res) => {
  const product = getRequestParam(req, "product", "productName");
  const subProduct = getRequestParam(
    req,
    "subProduct",
    "subProductName",
  );
  const branchIds = await resolveDropdownBranchIds(req);

  if (!product) {
    throw new ApiError(
      400,
      'Parameter "product" is required in query or body',
    );
  }

  if (!subProduct) {
    throw new ApiError(
      400,
      'Parameter "subProduct" is required in query or body',
    );
  }

  const data = await productService.getCenters(product, subProduct, branchIds);
  sendSuccess(res, data);
};
