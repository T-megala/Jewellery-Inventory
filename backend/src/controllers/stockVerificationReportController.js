import ApiError from '../utils/ApiError.js';
import stockVerificationReportService from '../services/stockVerificationReportService.js';

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

const validateFilters = (query) => {
  const page = parsePositiveInt(query.page, 'page', 1);
  const limit = parsePositiveInt(query.limit, 'limit', 20);

  if (limit > 100) {
    throw new ApiError(400, 'limit cannot exceed 100');
  }

  const fromDate = validateDate(query.fromDate, 'fromDate');
  const toDate = validateDate(query.toDate, 'toDate');

  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    throw new ApiError(
      400,
      'Both fromDate and toDate are required for date range filtering'
    );
  }

  if (fromDate && toDate && fromDate > toDate) {
    throw new ApiError(400, 'fromDate cannot be greater than toDate');
  }

  const status = query.status ? String(query.status).trim().toUpperCase() : null;

  if (status && !stockVerificationReportService.VALID_STATUSES.includes(status)) {
    throw new ApiError(400, 'status must be one of FOUND, MISSING, or NEW');
  }

  return {
    filters: {
      productName: query.productName ? String(query.productName).trim() : null,
      subProductName: query.subProductName
        ? String(query.subProductName).trim()
        : null,
      centerName: query.centerName ? String(query.centerName).trim() : null,
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
  const { filters, pagination } = validateFilters(req.query);
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
