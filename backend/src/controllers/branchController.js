import ApiError from "../utils/ApiError.js";
import branchService from "../services/branchService.js";

const parseId = (raw) => {
  const id = Number.parseInt(String(raw), 10);

  if (!Number.isInteger(id) || id < 1) {
    throw new ApiError(400, "id must be a positive integer");
  }

  return id;
};

export const listBranches = async (req, res) => {
  const branches = await branchService.getAllBranches();

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
