import ApiError from "../utils/ApiError.js";
import branchService from "../services/branchService.js";
import userBranchService from "../services/userBranchService.js";

const parseId = (raw) => {
  const id = Number.parseInt(String(raw), 10);

  if (!Number.isInteger(id) || id < 1) {
    throw new ApiError(400, "id must be a positive integer");
  }

  return id;
};

/** List branches from user_branches mapping (not JWT token). */
const resolveListedBranches = async (req) => {
  const userId = Number(req.user?.id ?? req.user?.sub);

  if (!userId) {
    return [];
  }

  const assignedIds = await userBranchService.getBranchIdsForUser(userId);

  if (assignedIds.length === 0) {
    return [];
  }

  return branchService.getBranchesByIds(assignedIds);
};

export const listBranches = async (req, res) => {
  const branches = await resolveListedBranches(req);

  res.status(200).json({ success: true, data: branches });
};

export const listBranchesAndroid = async (_req, res) => {
  const branches = await branchService.getAllBranches();

  res.status(200).json({
    success: true,
    message: "Data fetched successfully",
    data: branches.map(({ id, name }) => ({ id, name })),
  });
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
  res
    .status(200)
    .json({ success: true, message: "Branch deleted successfully" });
};
