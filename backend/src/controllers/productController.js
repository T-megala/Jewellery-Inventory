import ApiError from "../utils/ApiError.js";
import productService from "../services/productService.js";

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

export const getProductList = async (req, res) => {
  const page = parsePositiveInt(req.query.page, "page", 1);
  const limit = parsePositiveInt(req.query.limit, "limit", 20);

  if (limit > 100) {
    throw new ApiError(400, "limit cannot exceed 100");
  }

  const search = req.query.search ? String(req.query.search).trim() : null;

  const result = await productService.getProductList({
    search,
    page,
    limit,
    offset: (page - 1) * limit,
  });

  res.status(200).json({
    success: true,
    message: "Product list fetched successfully",
    pagination: result.pagination,
    data: result.data,
  });
};

export const getProducts = async (req, res) => {
  const data = await productService.getProducts();
  sendSuccess(res, data);
};

export const getSubProducts = async (req, res) => {
  const { product } = req.query;

  if (!product || !String(product).trim()) {
    throw new ApiError(400, 'Query parameter "product" is required');
  }

  const data = await productService.getSubProducts(String(product).trim());
  sendSuccess(res, data);
};

export const getCenters = async (req, res) => {
  const { product, subProduct } = req.query;

  if (!product || !String(product).trim()) {
    throw new ApiError(400, 'Query parameter "product" is required');
  }

  if (!subProduct || !String(subProduct).trim()) {
    throw new ApiError(400, 'Query parameter "subProduct" is required');
  }

  const data = await productService.getCenters(
    String(product).trim(),
    String(subProduct).trim(),
  );
  sendSuccess(res, data);
};
