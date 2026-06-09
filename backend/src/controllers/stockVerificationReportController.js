import ApiError from '../utils/ApiError.js';
import stockVerificationReportService from '../services/stockVerificationReportService.js';
import { getRequestParam } from '../utils/requestParams.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parsePositiveInt = (value, fieldName, defaultValue) => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError(400, `${fieldName} must be a positive integer`);
  }

  return parsed;
};

const validateDate = (value, fieldName) => {
  if (!value) {
    return null;
  }

  const dateValue = String(value).trim();

  if (!DATE_PATTERN.test(dateValue)) {
    throw new ApiError(400, `${fieldName} must be in YYYY-MM-DD format`);
  }

  return dateValue;
};

const getRequestValue = (req, ...keys) => getRequestParam(req, ...keys);

const validateFilters = (req) => {
  const page = parsePositiveInt(getRequestParam(req, 'page'), 'page', 1);
  const limit = parsePositiveInt(getRequestParam(req, 'limit'), 'limit', 20);

  if (limit > 100) {
    throw new ApiError(400, 'limit cannot exceed 100');
  }

  const fromDate = validateDate(getRequestValue(req, 'fromDate'), 'fromDate');
  const toDate = validateDate(getRequestValue(req, 'toDate'), 'toDate');

  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    throw new ApiError(
      400,
      'Both fromDate and toDate are required for date range filtering'
    );
  }

  if (fromDate && toDate && fromDate > toDate) {
    throw new ApiError(400, 'fromDate cannot be greater than toDate');
  }

  const requestStatus = getRequestValue(req, 'status');
  const status = requestStatus ? String(requestStatus).trim().toUpperCase() : null;

  if (status && !stockVerificationReportService.VALID_STATUSES.includes(status)) {
    throw new ApiError(400, 'status must be one of FOUND, MISSING, or NEW');
  }

  const productName = getRequestValue(req, 'productName', 'product');
  const subProductName = getRequestValue(req, 'subProductName', 'subProduct');
  const centerName = getRequestValue(
    req,
    'centerName',
    'counterName',
    'center',
    'counter'
  );

  return {
    filters: {
      productName: productName ? String(productName).trim() : null,
      subProductName: subProductName ? String(subProductName).trim() : null,
      centerName: centerName ? String(centerName).trim() : null,
      status,
      fromDate,
      toDate,
    },
    pagination: {
      page,
      limit,
      offset: (page - 1) * limit,
    },
  };
};

export const getStockVerificationReport = async (req, res) => {
  const { filters, pagination } = validateFilters(req);
  const result = await stockVerificationReportService.getReport(
    filters,
    pagination
  );

  res.status(200).json({
    success: true,
    message: 'Report fetched successfully',
    pagination: result.pagination,
    summary: result.summary,
    data: result.data,
  });
};
