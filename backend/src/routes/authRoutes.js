import express from 'express';
import * as authController from '../controllers/authController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

router.post('/auth/login', asyncHandler(authController.login));

export default router;
