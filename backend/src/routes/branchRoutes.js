import express from "express";
import * as branchController from "../controllers/branchController.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { authorize } from "../middleware/accessMiddleware.js";
import { PERMISSIONS } from "../constants/permissions.js";

const router = express.Router();

router.get(
  "/branches",
  authorize(PERMISSIONS.BRANCHES_VIEW, PERMISSIONS.BRANCHES_VIEW_ALL),
  asyncHandler(branchController.listBranches),
);

router.get(
  "/branches/:id",
  authorize(PERMISSIONS.BRANCHES_VIEW, PERMISSIONS.BRANCHES_VIEW_ALL),
  asyncHandler(branchController.getBranch),
);
router.post(
  "/branches",
  authorize(PERMISSIONS.BRANCHES_ADD),
  asyncHandler(branchController.createBranch),
);
router.put(
  "/branches/:id",
  authorize(PERMISSIONS.BRANCHES_UPDATE),
  asyncHandler(branchController.updateBranch),
);
router.delete(
  "/branches/:id",
  authorize(PERMISSIONS.BRANCHES_DELETE),
  asyncHandler(branchController.deleteBranch),
);

export default router;
