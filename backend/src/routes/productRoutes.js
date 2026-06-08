import express from "express";
import * as productController from "../controllers/productController.js";
import * as productImportController from "../controllers/productImportController.js";
import upload from "../middleware/upload.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const router = express.Router();

router.get("/products", asyncHandler(productController.getProducts));
router.get("/sub-products", asyncHandler(productController.getSubProducts));
router.get("/centers", asyncHandler(productController.getCenters));
router.post(
  "/products/import",
  upload.single("file"),
  asyncHandler(productImportController.importProducts),
);

export default router;
