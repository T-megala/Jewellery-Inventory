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
  const [data, locationStockCount] = await Promise.all([
    productService.getProductsForBranch(branchIds),
    productService.getLocationStockCount(branchIds),
  ]);

  res.status(200).json({
    success: true,
    message: "Data fetched successfully",
    data,
    locationStockCount,
  });
};

export const getSubProducts = async (req, res) => {
  const product = getRequestParam(req, "product", "productName");
  const branchIds = await resolveDropdownBranchIds(req);

  if (!product) {
    throw new ApiError(400, 'Parameter "product" is required in query or body');
  }

  const [data, locationStockCount] = await Promise.all([
    productService.getSubProducts(product, branchIds),
    productService.getLocationStockCount(branchIds, { product }),
  ]);

  res.status(200).json({
    success: true,
    message: "Data fetched successfully",
    data,
    locationStockCount,
  });
};

export const getCenters = async (req, res) => {
  const product = getRequestParam(req, "product", "productName");
  const subProduct = getRequestParam(req, "subProduct", "subProductName");
  const center = getRequestParam(
    req,
    "counter",
    "center",
    "centerName",
    "counterName",
  );
  const branchIds = await resolveDropdownBranchIds(req);

  if (!product) {
    throw new ApiError(400, 'Parameter "product" is required in query or body');
  }

  if (!subProduct) {
    throw new ApiError(
      400,
      'Parameter "subProduct" is required in query or body',
    );
  }

  const [data, locationStockCount] = await Promise.all([
    productService.getCenters(product, subProduct, branchIds),
    productService.getLocationStockCount(branchIds, {
      product,
      subProduct,
      center,
    }),
  ]);

  res.status(200).json({
    success: true,
    message: "Data fetched successfully",
    data,
    locationStockCount,
  });
};

export const getPrintDetails = async (req, res) => {
  const tagNo = getRequestParam(req, "tagNo", "tagPacketNo", "tag");
  const branchIds = await resolveDropdownBranchIds(req);
  const page = getRequestParam(req, "page");
  const limit = getRequestParam(req, "limit");
  const { items, pagination } = await productService.getPrintDetails({
    tagNo: tagNo || null,
    branchIds,
    page,
    limit,
    extended: true,
  });

  if (tagNo && items.length === 0) {
    throw new ApiError(404, "Product not found for the given tag number");
  }

  res.status(200).json({
    success: true,
    message: "Print details fetched successfully",
    data: tagNo ? items[0] : items,
    ...(pagination ? { pagination } : {}),
  });
};
