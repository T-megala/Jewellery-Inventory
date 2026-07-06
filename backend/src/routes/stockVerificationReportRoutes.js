import express from 'express';
import * as stockVerificationReportController from '../controllers/stockVerificationReportController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authorize } from '../middleware/accessMiddleware.js';
import { PERMISSIONS } from '../constants/permissions.js';

const router = express.Router();

router.get(
  '/stock-verification/report',
  asyncHandler(stockVerificationReportController.getStockVerificationReport)
);
router.post(
  '/stock-verification/report',
  asyncHandler(stockVerificationReportController.getStockVerificationReport)
);
router.delete(
  '/stock-verification/today',
  authorize(PERMISSIONS.STOCK_VERIFICATION_UPLOAD),
  asyncHandler(stockVerificationReportController.clearTodayVerifications),
);

export default router;
