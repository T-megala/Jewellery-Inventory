import express from "express";
import * as stockVerificationReportController from "../controllers/stockVerificationReportController.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const router = express.Router();

router.get(
  "/stock-verification/android-report",
  asyncHandler(stockVerificationReportController.getStockVerificationReport),
);
router.post(
  "/stock-verification/android-report",
  asyncHandler(stockVerificationReportController.getStockVerificationReport),
);

export default router;
