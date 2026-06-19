import ApiError from "../utils/ApiError.js";
import * as userService from "../services/userService.js";

const MAX_USERNAME_LENGTH = 100;
const MAX_PASSWORD_BYTES = 72;

const normalizeUsername = (value) => String(value ?? "").trim();

const parseId = (raw) => {
  const id = Number.parseInt(String(raw), 10);

  if (!Number.isInteger(id) || id < 1) {
    throw new ApiError(400, "id must be a positive integer");
  }

  return id;
};

const parseOptionalIdField = (value, fieldName) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError(400, `${fieldName} must be a positive integer`);
  }

  return parsed;
};

export const listUsers = async (_req, res) => {
  const users = await userService.getAllUsers();
  res.status(200).json({ success: true, data: users });
};

export const getUser = async (req, res) => {
  const user = await userService.getUserById(parseId(req.params.id));

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  res.status(200).json({ success: true, data: user });
};

const parseBranchIdsField = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new ApiError(400, "branchIds must be an array");
  }

  return value;
};

export const createUser = async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const { password } = req.body ?? {};

  if (!username) {
    throw new ApiError(400, "Username is required");
  }

  if (username.length > MAX_USERNAME_LENGTH) {
    throw new ApiError(
      400,
      `Username must be at most ${MAX_USERNAME_LENGTH} characters`,
    );
  }

  if (!password) {
    throw new ApiError(400, "Password is required");
  }

  if (password.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters");
  }

  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    throw new ApiError(400, "Password is too long (max 72 bytes)");
  }

  const user = await userService.createUser({
    username,
    password,
    fullName: req.body?.fullName,
    roleId: parseOptionalIdField(req.body?.roleId, "roleId"),
    branchId: parseOptionalIdField(req.body?.branchId, "branchId"),
    branchIds: parseBranchIdsField(req.body?.branchIds),
    defaultBranchId: parseOptionalIdField(
      req.body?.defaultBranchId,
      "defaultBranchId",
    ),
    isActive: req.body?.isActive !== false,
  });

  res.status(201).json({ success: true, data: user });
};

export const updateUser = async (req, res) => {
  const id = parseId(req.params.id);
  const fields = {};

  if (req.body?.username !== undefined) {
    const username = normalizeUsername(req.body.username);

    if (!username) {
      throw new ApiError(400, "Username is required");
    }

    if (username.length > MAX_USERNAME_LENGTH) {
      throw new ApiError(
        400,
        `Username must be at most ${MAX_USERNAME_LENGTH} characters`,
      );
    }

    fields.username = username;
  }

  if (req.body?.password !== undefined) {
    const { password } = req.body;

    if (password.length < 6) {
      throw new ApiError(400, "Password must be at least 6 characters");
    }

    if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
      throw new ApiError(400, "Password is too long (max 72 bytes)");
    }

    fields.password = password;
  }

  if (req.body?.fullName !== undefined) {
    fields.fullName = req.body.fullName;
  }

  if (req.body?.roleId !== undefined) {
    fields.roleId = parseOptionalIdField(req.body.roleId, "roleId");
  }

  if (req.body?.branchId !== undefined) {
    fields.branchId = parseOptionalIdField(req.body.branchId, "branchId");
  }

  if (req.body?.branchIds !== undefined) {
    fields.branchIds = parseBranchIdsField(req.body.branchIds);
  }

  if (req.body?.defaultBranchId !== undefined) {
    fields.defaultBranchId = parseOptionalIdField(
      req.body.defaultBranchId,
      "defaultBranchId",
    );
  }

  if (req.body?.isActive !== undefined) {
    fields.isActive = Boolean(req.body.isActive);
  }

  const user = await userService.updateUser(id, fields);
  res.status(200).json({ success: true, data: user });
};

export const deleteUser = async (req, res) => {
  const id = parseId(req.params.id);

  if (req.user && Number(req.user.id) === id) {
    throw new ApiError(403, "You cannot delete your own account");
  }

  await userService.deleteUser(id);
  res.status(200).json({ success: true, message: "User deleted successfully" });
};
