import express from 'express';
import * as erpProductCodeController from '../controllers/erpProductCodeController.js';
import upload from '../middleware/upload.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authorize } from '../middleware/accessMiddleware.js';
import { PERMISSIONS } from '../constants/permissions.js';

const router = express.Router();

router.get(
  '/product-codes',
  authorize(PERMISSIONS.PRODUCTS_VIEW, PERMISSIONS.PRODUCTS_IMPORT),
  asyncHandler(erpProductCodeController.listProductCodes),
);

router.get(
  '/product-codes/:proCode',
  authorize(PERMISSIONS.PRODUCTS_VIEW, PERMISSIONS.PRODUCTS_IMPORT),
  asyncHandler(erpProductCodeController.getProductCode),
);

router.post(
  '/product-codes/merge',
  authorize(PERMISSIONS.PRODUCTS_IMPORT),
  asyncHandler(erpProductCodeController.mergeProductCodes),
);

router.post(
  '/product-codes/import',
  upload.single('file'),
  authorize(PERMISSIONS.PRODUCTS_IMPORT),
  asyncHandler(erpProductCodeController.importProductCodes),
);

export default router;
