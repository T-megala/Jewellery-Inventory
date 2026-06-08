import express from 'express';
import * as productController from '../controllers/productController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

router.get('/products', asyncHandler(productController.getProducts));
router.get('/sub-products', asyncHandler(productController.getSubProducts));
router.get('/centers', asyncHandler(productController.getCenters));

export default router;
