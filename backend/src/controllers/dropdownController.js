import ApiError from '../utils/ApiError.js';
import dropdownService from '../services/dropdownService.js';
import { getRequestParam } from '../utils/requestParams.js';

const sendSuccess = (res, data) => {
  res.status(200).json({
    success: true,
    message: 'Dropdown data fetched successfully',
    data,
  });
};

export const getProducts = async (req, res) => {
  const data = await dropdownService.getProducts({
    includeAllProductsOption: false,
  });
  sendSuccess(res, data);
};

export const getSubProducts = async (req, res) => {
  const productName = getRequestParam(req, 'productName', 'product');

  if (!productName) {
    throw new ApiError(
      400,
      'Parameter "productName" is required in query or body',
    );
  }

  const data = await dropdownService.getSubProducts(productName, {
    includeAllSubProductsOption: false,
  });
  sendSuccess(res, data);
};

export const getCenters = async (req, res) => {
  const productName = getRequestParam(req, 'productName', 'product');
  const subProductName = getRequestParam(
    req,
    'subProductName',
    'subProduct',
  );

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
    includeAllCentersOption: false,
  });
  sendSuccess(res, data);
};
