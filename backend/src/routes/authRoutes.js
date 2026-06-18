import express from 'express';
import * as authController from '../controllers/authController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticateApi } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/auth/login', asyncHandler(authController.login));
router.get('/auth/profile', authenticateApi, asyncHandler(authController.getProfile));

export default router;
