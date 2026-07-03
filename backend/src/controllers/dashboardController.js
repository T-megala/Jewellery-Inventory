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

  const result = await dashboardService.getDayWiseSales({ period });

  res.status(200).json({
    success: true,
    message: 'Day-wise sales fetched successfully',
    period: result.period,
    totalSoldQty: result.totalSoldQty,
    totalSoldPieces: result.totalSoldPieces,
    counter: result.counter,
    data: result.data,
  });
};

export const getDailyImports = async (req, res) => {
  const period = getRequestParam(req, 'period') ?? 'week';

  const result = await dashboardService.getDailyImports({ period });

  res.status(200).json({
    success: true,
    message: 'Daily import trend fetched successfully',
    period: result.period,
    counter: result.counter,
    data: result.data,
  });
};

export const getExecutiveDashboard = async (req, res) => {
  const type = getRequestParam(req, 'type') ?? 'warehouse';
  const data = await dashboardService.getExecutiveDashboard({ type });
  sendSuccess(res, data, 'Executive dashboard fetched successfully');
};
