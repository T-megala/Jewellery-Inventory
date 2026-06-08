import express from 'express';
import * as stockVerificationController from '../controllers/stockVerificationController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

router.post(
  '/stock-verification/upload',
  asyncHandler(stockVerificationController.uploadStockVerification)
);

export default router;
