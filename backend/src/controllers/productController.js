import ApiError from '../utils/ApiError.js';
import productService from '../services/productService.js';

const sendSuccess = (res, data) => {
  res.status(200).json({
    success: true,
    message: 'Data fetched successfully',
    data,
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
    String(subProduct).trim()
  );
  sendSuccess(res, data);
};
