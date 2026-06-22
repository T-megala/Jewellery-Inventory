import ApiError from "../utils/ApiError.js";
import branchService from "../services/branchService.js";
import userBranchService from "../services/userBranchService.js";
import { SUPER_ADMIN_ROLE_NAME } from "../services/roleService.js";

const parseId = (raw) => {
  const id = Number.parseInt(String(raw), 10);

  if (!Number.isInteger(id) || id < 1) {
    throw new ApiError(400, "id must be a positive integer");
  }

  return id;
};

const resolveListedBranches = async (req) => {
  if (req.user?.roleName === SUPER_ADMIN_ROLE_NAME) {
    const selectedBranchIds = Array.isArray(req.user?.selectedBranchIds)
      ? req.user.selectedBranchIds.filter((id) => id > 0)
      : [];

    if (selectedBranchIds.length > 0) {
      return branchService.getBranchesByIds(selectedBranchIds);
    }

    return branchService.getAllBranches();
  }

  if (req.user?.id) {
    const selectedBranchIds = Array.isArray(req.user?.selectedBranchIds)
      ? req.user.selectedBranchIds.filter((id) => id > 0)
      : [];

    if (selectedBranchIds.length > 0) {
      return branchService.getBranchesByIds(selectedBranchIds);
    }

    const branchIds =
      Array.isArray(req.user.branchIds) && req.user.branchIds.length > 0
        ? req.user.branchIds
        : await userBranchService.getBranchIdsForUser(req.user.id);

    return branchService.getBranchesByIds(branchIds);
  }

  return branchService.getAllBranches();
};

export const listBranches = async (req, res) => {
  const branches = await resolveListedBranches(req);

  res.status(200).json({ success: true, data: branches });
};

export const getBranch = async (req, res) => {
  const branch = await branchService.getBranchById(parseId(req.params.id));

  if (!branch) {
    throw new ApiError(404, "Branch not found");
  }

  res.status(200).json({ success: true, data: branch });
};

export const createBranch = async (req, res) => {
  const branch = await branchService.createBranch({
    name: req.body?.name,
    address: req.body?.address,
    city: req.body?.city,
    phone: req.body?.phone,
  });

  res.status(201).json({ success: true, data: branch });
};

export const updateBranch = async (req, res) => {
  const branch = await branchService.updateBranch(parseId(req.params.id), {
    name: req.body?.name,
    address: req.body?.address,
    city: req.body?.city,
    phone: req.body?.phone,
  });

  res.status(200).json({ success: true, data: branch });
};

export const deleteBranch = async (req, res) => {
  await branchService.deleteBranch(parseId(req.params.id));
  res.status(200).json({ success: true, message: "Branch deleted successfully" });
};
