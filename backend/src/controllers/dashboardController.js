import dashboardService from '../services/dashboardService.js';
import { getRequestParam } from '../utils/requestParams.js';

const sendSuccess = (res, data, message = 'Data fetched successfully') => {
  res.status(200).json({
    success: true,
    message,
    data,
  });
};

export const getInventorySummary = async (req, res) => {
  const data = await dashboardService.getInventorySummary();
  sendSuccess(res, data, 'Inventory summary fetched successfully');
};

export const getVerificationSummary = async (req, res) => {
  const data = await dashboardService.getVerificationSummary();
  sendSuccess(res, data, 'Verification summary fetched successfully');
};

export const getDashboard = async (req, res) => {
  const data = await dashboardService.getDashboard();
  sendSuccess(res, data, 'Dashboard data fetched successfully');
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
  const slowDays = getRequestParam(req, 'slowDays');
  const fastDays = getRequestParam(req, 'fastDays');
  const limit = getRequestParam(req, 'limit');

  const result = await dashboardService.getStockMovement({
    slowDays,
    fastDays,
    limit,
  });

  sendSuccess(res, result, 'Stock movement fetched successfully');
};
