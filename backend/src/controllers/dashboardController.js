import { resolveRequestBranchIds } from '../utils/branchScope.js';
import dashboardService from '../services/dashboardService.js';
import smartAlertsService from '../services/smartAlertsService.js';
import { getRequestParam } from '../utils/requestParams.js';

const sendSuccess = (res, data, message = 'Data fetched successfully') => {
  res.status(200).json({
    success: true,
    message,
    data,
  });
};

const withBranchScope = async (req, res, handler, message) => {
  const branchIds = await resolveRequestBranchIds(req);
  const data = await handler(branchIds);

  res.status(200).json({
    success: true,
    message,
    branchIds,
    branchId: branchIds.length === 1 ? branchIds[0] : null,
    data,
  });
};

export const getInventorySummary = async (req, res) => {
  await withBranchScope(
    req,
    res,
    (branchIds) => dashboardService.getInventorySummary({ branchIds }),
    'Inventory summary fetched successfully',
  );
};

export const getVerificationSummary = async (req, res) => {
  await withBranchScope(
    req,
    res,
    (branchIds) => dashboardService.getVerificationSummary({ branchIds }),
    'Verification summary fetched successfully',
  );
};

export const getDashboard = async (req, res) => {
  await withBranchScope(
    req,
    res,
    (branchIds) => dashboardService.getDashboard({ branchIds }),
    'Dashboard data fetched successfully',
  );
};

export const getTopSoldProducts = async (req, res) => {
  const period = getRequestParam(req, 'period') ?? 'all';
  const result = await dashboardService.getTopSoldProducts({ period });

  res.status(200).json({
    success: true,
    message: 'Top sold products fetched successfully',
    period: result.period,
    data: result.products,
  });
};

export const getDayWiseSales = async (req, res) => {
  const period = getRequestParam(req, 'period') ?? 'week';
  const counter = getRequestParam(req, 'counter') ?? 'all';

  const result = await dashboardService.getDayWiseSales({ period, counter });

  res.status(200).json({
    success: true,
    message: 'Day-wise sales fetched successfully',
    period: result.period,
    counter: result.counter,
    totalSoldPieces: result.totalSoldPieces,
    data: result.data,
  });
};

export const getDailyImports = async (req, res) => {
  const period = getRequestParam(req, 'period') ?? 'week';
  const counter = getRequestParam(req, 'counter') ?? 'ALL';

  const result = await dashboardService.getDailyImports({ period, counter });

  res.status(200).json({
    success: true,
    message: 'Daily import trend fetched successfully',
    period: result.period,
    counter: result.counter,
    data: result.data,
  });
};

export const getStockMovement = async (req, res) => {
  const branchIds = await resolveRequestBranchIds(req);
  const slowDays = getRequestParam(req, 'slowDays');
  const fastDays = getRequestParam(req, 'fastDays');
  const limit = getRequestParam(req, 'limit');

  const result = await dashboardService.getStockMovement({
    branchIds,
    slowDays,
    fastDays,
    limit,
  });

  res.status(200).json({
    success: true,
    message: 'Stock movement fetched successfully',
    branchIds,
    branchId: branchIds.length === 1 ? branchIds[0] : null,
    data: result,
  });
};

export const getBranchComparison = async (req, res) => {
  const branchIds = await resolveRequestBranchIds(req);
  const data = await dashboardService.getBranchComparison({ branchIds });

  res.status(200).json({
    success: true,
    message: 'Branch comparison fetched successfully',
    branchIds,
    branchId: branchIds.length === 1 ? branchIds[0] : null,
    data,
  });
};

export const getSmartAlerts = async (req, res) => {
  const branchIds = await resolveRequestBranchIds(req);
  const consecutiveStocktakes = getRequestParam(req, 'consecutiveStocktakes');
  const accuracyDropThreshold = getRequestParam(req, 'accuracyDropThreshold');
  const limit = getRequestParam(req, 'limit');

  const result = await smartAlertsService.getSmartAlerts({
    branchIds,
    consecutiveStocktakes,
    accuracyDropThreshold,
    limit,
  });

  res.status(200).json({
    success: true,
    message: 'Smart alerts fetched successfully',
    branchIds,
    branchId: branchIds.length === 1 ? branchIds[0] : null,
    data: result,
  });
};
