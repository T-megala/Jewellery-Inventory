import ApiError from "../utils/ApiError.js";
import { resolveRequestBranchIds } from "../utils/branchScope.js";
import stockVerificationReportService from "../services/stockVerificationReportService.js";
import androidScanReportService from "../services/androidScanReportService.js";
import { getRequestParam } from "../utils/requestParams.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VALID_EXPORT_TYPES = ["excel", "pdf"];

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

const validateFilters = async (req, { isExport = false } = {}) => {
  const page = parsePositiveInt(getRequestParam(req, "page"), "page", 1);
  const limit = parsePositiveInt(getRequestParam(req, "limit"), "limit", 20);

  if (!isExport && limit > 100) {
    throw new ApiError(400, "limit cannot exceed 100");
  }

  const dateRaw = getRequestValue(req, "date");
  if (!dateRaw || !String(dateRaw).trim()) {
    throw new ApiError(400, "Date is required");
  }

  const date = validateDate(dateRaw, "date");

  const requestStatus = getRequestValue(req, "status");
  const status = requestStatus
    ? String(requestStatus).trim().toUpperCase()
    : null;

  if (
    status &&
    !stockVerificationReportService.VALID_STATUSES.includes(status)
  ) {
    throw new ApiError(400, "status must be one of FOUND, MISSING, or NEW");
  }

  const productName = getRequestValue(req, "productName", "product");
  const subProductName = getRequestValue(req, "subProductName", "subProduct");
  const centerName = getRequestValue(
    req,
    "centerName",
    "counterName",
    "center",
    "counter",
  );

  const exportTypeRaw = getRequestValue(req, "export_type", "exportType");
  const exportType = exportTypeRaw
    ? String(exportTypeRaw).trim().toLowerCase()
    : null;

  if (exportType && !VALID_EXPORT_TYPES.includes(exportType)) {
    throw new ApiError(400, "export_type must be excel or pdf");
  }

  const branchIds = await resolveRequestBranchIds(req);

  return {
    filters: {
      productName: productName ? String(productName).trim() : null,
      subProductName: subProductName ? String(subProductName).trim() : null,
      centerName: centerName ? String(centerName).trim() : null,
      status,
      date,
      branchIds,
    },
    pagination: {
      page,
      limit,
      offset: (page - 1) * limit,
    },
    exportType,
  };
};

export const getStockVerificationReport = async (req, res) => {
  const { filters, pagination, exportType } = await validateFilters(req, {
    isExport: Boolean(getRequestValue(req, "export_type", "exportType")),
  });

  if (exportType) {
    const file = await stockVerificationReportService.exportReport(
      filters,
      exportType,
    );

    res.setHeader("Content-Type", file.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.fileName}"`,
    );
    return res.status(200).send(file.buffer);
  }

  const result = await stockVerificationReportService.getReport(
    filters,
    pagination,
  );

  res.status(200).json({
    success: true,
    message: "Report fetched successfully",
    date: filters.date,
    branchIds: filters.branchIds,
    branchId:
      filters.branchIds.length === 1 ? filters.branchIds[0] : null,
    pagination: result.pagination,
    summary: result.summary,
    data: result.data,
  });
};

const parseScanId = (req) => {
  const rawValue = getRequestParam(
    req,
    "scanId",
    "latestStockVerificationId",
    "latest_scan_id",
  );

  if (!rawValue) {
    return null;
  }

  const parsed = Number.parseInt(String(rawValue), 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError(400, "scanId must be a positive integer when provided");
  }

  return parsed;
};

export const getAndroidScanReport = async (req, res) => {
  const scanId = parseScanId(req);
  const branchIds = await resolveRequestBranchIds(req);
  const branchId = branchIds.length === 1 ? branchIds[0] : branchIds[0] ?? null;
  const result = await androidScanReportService.getAndroidScanReport({
    scanId,
    branchId,
  });

  res.status(200).json({
    success: true,
    message: "Android scan report fetched successfully",
    data: result,
  });
};
