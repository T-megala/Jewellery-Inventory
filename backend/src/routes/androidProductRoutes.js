import express from "express";
import * as androidProductController from "../controllers/androidProductController.js";
import { asyncHandler } from "../middleware/errorHandler.js";

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
  "/products-android",
  asyncHandler(androidProductController.getProducts),
);
router.get(
  "/sub-products-android",
  asyncHandler(androidProductController.getSubProducts),
);
router.post(
  "/sub-products-android",
  asyncHandler(androidProductController.getSubProducts),
);
router.get(
  "/centers-android",
  asyncHandler(androidProductController.getCenters),
);
router.post(
  "/centers-android",
  asyncHandler(androidProductController.getCenters),
);
router.get(
  "/print-details-android",
  asyncHandler(androidProductController.getPrintDetails),
);
router.post(
  "/print-details-android",
  asyncHandler(androidProductController.getPrintDetails),
);

export default router;
