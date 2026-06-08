import ApiError from '../utils/ApiError.js';
import dropdownService from '../services/dropdownService.js';

const sendSuccess = (res, data) => {
  res.status(200).json({
    success: true,
    message: 'Dropdown data fetched successfully',
    data,
  });
};

export const getProducts = async (req, res) => {
  const data = await dropdownService.getProducts();
  sendSuccess(res, data);
};

export const getSubProducts = async (req, res) => {
  const productName =
    req.query.productName || req.query.product;

  if (!productName || !String(productName).trim()) {
    throw new ApiError(400, 'Query parameter "productName" is required');
  }

  const data = await dropdownService.getSubProducts(String(productName).trim());
  sendSuccess(res, data);
};

export const getCenters = async (req, res) => {
  const productName =
    req.query.productName || req.query.product;
  const subProductName =
    req.query.subProductName || req.query.subProduct;

  if (!productName || !String(productName).trim()) {
    throw new ApiError(400, 'Query parameter "productName" is required');
  }

  if (!subProductName || !String(subProductName).trim()) {
    throw new ApiError(400, 'Query parameter "subProductName" is required');
  }

  const data = await dropdownService.getCenters(
    String(productName).trim(),
    String(subProductName).trim()
  );
  sendSuccess(res, data);
};
