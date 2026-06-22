import ApiError from "../utils/ApiError.js";
import stockVerificationProductSummaryService from "../services/stockVerificationProductSummaryService.js";
import { getRequestParam } from "../utils/requestParams.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  const page = parsePositiveInt(getRequestParam(req, "page"), "page", 1);
  const limit = parsePositiveInt(getRequestParam(req, "limit"), "limit", 20);

  if (limit > 100) {
    throw new ApiError(400, "limit cannot exceed 100");
  }

  const singleDate = validateDate(getRequestValue(req, "date"), "date");
  let fromDate = validateDate(
    getRequestValue(req, "fromDate", "fromdate"),
    "fromDate",
  );
  let toDate = validateDate(
    getRequestValue(req, "toDate", "todate"),
    "toDate",
  );

  if (singleDate) {
    if (fromDate || toDate) {
      throw new ApiError(
        400,
        "Use either date or fromDate/toDate, not both",
      );
    }

    fromDate = singleDate;
    toDate = singleDate;
  } else if (fromDate && !toDate) {
    toDate = fromDate;
  } else if (!fromDate && toDate) {
    fromDate = toDate;
  }

  if (fromDate && toDate && fromDate > toDate) {
    throw new ApiError(400, "fromDate cannot be greater than toDate");
  }

  const verificationStatusRaw = getRequestValue(
    req,
    "verificationStatus",
    "status",
  );
  const verificationStatus = verificationStatusRaw
    ? String(verificationStatusRaw).trim().toUpperCase()
    : null;

  if (
    verificationStatus &&
    !stockVerificationProductSummaryService.VALID_PRODUCT_STATUSES.includes(
      verificationStatus,
    )
  ) {
    throw new ApiError(
      400,
      "verificationStatus must be FULLY_VERIFIED, PARTIALLY_VERIFIED, NOT_VERIFIED, or NEW",
    );
  }

  const search = getRequestValue(req, "search", "q");

  return {
    filters: {
      search: search ? String(search).trim() : null,
      verificationStatus,
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

export const getStockVerificationProductSummary = async (req, res) => {
  const { filters, pagination } = validateFilters(req);

  const result = await stockVerificationProductSummaryService.getProductSummary(
    filters,
    pagination,
  );

  res.status(200).json({
    success: true,
    message: "Product summary fetched successfully",
    verificationId: result.verificationId,
    pagination: result.pagination,
    summary: result.summary,
    data: result.data,
  });
};
