import express from "express";
import * as roleController from "../controllers/roleController.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { authorize } from "../middleware/accessMiddleware.js";
import { PERMISSIONS } from "../constants/permissions.js";

const router = express.Router();

router.get(
  "/permissions",
  authorize(PERMISSIONS.ROLES_VIEW, PERMISSIONS.ROLES_MANAGE),
  asyncHandler(roleController.listPermissions),
);
router.get(
  "/roles",
  authorize(PERMISSIONS.ROLES_VIEW, PERMISSIONS.ROLES_MANAGE),
  asyncHandler(roleController.listRoles),
);
router.get(
  "/roles/:id",
  authorize(PERMISSIONS.ROLES_VIEW, PERMISSIONS.ROLES_MANAGE),
  asyncHandler(roleController.getRole),
);
router.post(
  "/roles",
  authorize(PERMISSIONS.ROLES_MANAGE),
  asyncHandler(roleController.createRole),
);
router.put(
  "/roles/:id",
  authorize(PERMISSIONS.ROLES_MANAGE),
  asyncHandler(roleController.updateRole),
);
router.delete(
  "/roles/:id",
  authorize(PERMISSIONS.ROLES_MANAGE),
  asyncHandler(roleController.deleteRole),
);

export default router;
