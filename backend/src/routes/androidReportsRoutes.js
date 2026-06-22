import express from "express";
import * as stockVerificationReportController from "../controllers/stockVerificationReportController.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import * as branchController from "../controllers/branchController.js";

const router = express.Router();

const noCache = (_req, res, next) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  next();
};

router.use(noCache);

router.get(
  "/stock-verification/android-report",
  asyncHandler(stockVerificationReportController.getAndroidScanReport),
);
router.post(
  "/stock-verification/android-report",
  asyncHandler(stockVerificationReportController.getAndroidScanReport),
);

router.get("/branches-android", asyncHandler(branchController.listBranches));

export default router;
