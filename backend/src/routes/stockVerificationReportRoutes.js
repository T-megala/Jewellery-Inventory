import express from 'express';
import * as stockVerificationReportController from '../controllers/stockVerificationReportController.js';
import * as stockVerificationProductSummaryController from '../controllers/stockVerificationProductSummaryController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

router.get(
  '/stock-verification/report',
  asyncHandler(stockVerificationReportController.getStockVerificationReport)
);
router.post(
  '/stock-verification/report',
  asyncHandler(stockVerificationReportController.getStockVerificationReport)
);
router.get(
  '/stock-verification/product-summary',
  asyncHandler(stockVerificationProductSummaryController.getStockVerificationProductSummary)
);
router.post(
  '/stock-verification/product-summary',
  asyncHandler(stockVerificationProductSummaryController.getStockVerificationProductSummary)
);

export default router;
