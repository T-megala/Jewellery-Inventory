import express from "express";
import * as userController from "../controllers/userController.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { authorize } from "../middleware/accessMiddleware.js";
import { PERMISSIONS } from "../constants/permissions.js";

const router = express.Router();

router.get(
  "/users",
  authorize(PERMISSIONS.USERS_VIEW),
  asyncHandler(userController.listUsers),
);
router.get(
  "/users/:id",
  authorize(PERMISSIONS.USERS_VIEW),
  asyncHandler(userController.getUser),
);
router.post(
  "/users",
  authorize(PERMISSIONS.USERS_ADD),
  asyncHandler(userController.createUser),
);
router.put(
  "/users/:id",
  authorize(PERMISSIONS.USERS_UPDATE),
  asyncHandler(userController.updateUser),
);
router.delete(
  "/users/:id",
  authorize(PERMISSIONS.USERS_DELETE),
  asyncHandler(userController.deleteUser),
);

export default router;
