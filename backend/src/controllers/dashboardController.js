import dashboardService from '../services/dashboardService.js';

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
