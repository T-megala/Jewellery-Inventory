import ApiError from "../utils/ApiError.js";
import { resolveRequestBranchIds } from "../utils/branchScope.js";
import productService from "../services/productService.js";
import { getRequestParam } from "../utils/requestParams.js";

const parsePositiveInt = (value, fieldName, defaultValue) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError(400, `${fieldName} must be a positive integer`);
  }

  return parsed;
};

const sendSuccess = (res, data) => {
  res.status(200).json({
    success: true,
    message: "Data fetched successfully",
    data,
  });
};

const parseProductListFilters = async (req) => {
  const search =
    getRequestParam(req, "search") ??
    (req.query.search ? String(req.query.search).trim() : null);
  const batchIdValue =
    getRequestParam(req, "batchId") ?? req.query.batchId ?? null;
  const batchId = batchIdValue
    ? Number.parseInt(String(batchIdValue), 10)
    : null;

  if (batchId !== null && (!Number.isInteger(batchId) || batchId < 1)) {
    throw new ApiError(400, "batchId must be a positive integer");
  }

  const branchIds = await resolveRequestBranchIds(req);

  return { search, batchId, branchIds };
};

export const getProductList = async (req, res) => {
  const page = parsePositiveInt(
    getRequestParam(req, "page") ?? req.query.page,
    "page",
    1,
  );
  const limit = parsePositiveInt(
    getRequestParam(req, "limit") ?? req.query.limit,
    "limit",
    20,
  );

  if (limit > 100) {
    throw new ApiError(400, "limit cannot exceed 100");
  }

  const { search, batchId, branchIds } = await parseProductListFilters(req);

  const result = await productService.getProductList({
    search,
    page,
    limit,
    offset: (page - 1) * limit,
    batchId,
    branchIds,
  });

  res.status(200).json({
    success: true,
    message: "Product list fetched successfully",
    batchId: result.batchId,
    branchIds: result.branchIds,
    branchId: result.branchIds.length === 1 ? result.branchIds[0] : null,
    pagination: result.pagination,
    data: result.data,
  });
};

export const exportProductList = async (req, res) => {
  const { search, batchId, branchIds } = await parseProductListFilters(req);

  const file = await productService.exportProductListExcel({
    search,
    batchId,
    branchIds,
  });

  res.setHeader("Content-Type", file.contentType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${file.fileName}"`,
  );
  return res.status(200).send(file.buffer);
};

export const getProducts = async (req, res) => {
  const branchIds = await resolveRequestBranchIds(req);
  const data = await productService.getProductsForBranch(branchIds);
  sendSuccess(res, data);
};

export const getSubProducts = async (req, res) => {
  const product = getRequestParam(req, "product", "productName");
  const branchIds = await resolveRequestBranchIds(req);

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
  const branchIds = await resolveRequestBranchIds(req);

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
