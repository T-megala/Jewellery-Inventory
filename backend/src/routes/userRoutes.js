import express from 'express';
import * as userController from '../controllers/userController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

router.get('/users',     asyncHandler(userController.listUsers));
router.get('/users/:id', asyncHandler(userController.getUser));
router.post('/users',    asyncHandler(userController.createUser));
router.put('/users/:id', asyncHandler(userController.updateUser));
router.delete('/users/:id', asyncHandler(userController.deleteUser));

export default router;
