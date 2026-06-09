import express from 'express';
import * as productBatchController from '../controllers/productBatchController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

router.get('/product-batches', asyncHandler(productBatchController.listBatches));
router.get(
  '/product-batches/compare',
  asyncHandler(productBatchController.compareBatches)
);
router.get(
  '/product-batches/:batchId/products',
  asyncHandler(productBatchController.getBatchProducts)
);

export default router;
