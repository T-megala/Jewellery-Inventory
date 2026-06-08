import express from 'express';
import * as dropdownController from '../controllers/dropdownController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

router.get('/dropdown/products', asyncHandler(dropdownController.getProducts));
router.get(
  '/dropdown/sub-products',
  asyncHandler(dropdownController.getSubProducts)
);
router.get('/dropdown/centers', asyncHandler(dropdownController.getCenters));

export default router;
