import express from 'express';
import * as dashboardController from '../controllers/dashboardController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

router.get('/products/summary', asyncHandler(dashboardController.getInventorySummary));
router.get('/dashboard/verification-summary', asyncHandler(dashboardController.getVerificationSummary));
router.get('/dashboard', asyncHandler(dashboardController.getDashboard));

export default router;
