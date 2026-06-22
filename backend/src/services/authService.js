import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";
import { createAccessToken } from "../utils/token.js";
import { verifyPassword } from "../utils/passwordHasher.js";
import roleService from "./roleService.js";
import userBranchService from "./userBranchService.js";
import branchService from "./branchService.js";

const mapRole = (row) =>
  row?.role_id
    ? {
        id: Number(row.role_id),
        name: row.role_name,
      }
    : null;

const parseBranchIdsInput = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Array.isArray(value)) {
    throw new ApiError(400, "branchIds must be an array");
  }

  const parsed = [
    ...new Set(
      value
        .map((id) => Number.parseInt(String(id), 10))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];

  if (parsed.length === 0) {
    throw new ApiError(400, "At least one branch must be selected");
  }

  return parsed;
};

const validateSelectedBranchIds = (selectedBranchIds, mappedBranchIds) => {
  const mappedSet = new Set(mappedBranchIds);

  for (const branchId of selectedBranchIds) {
    if (!mappedSet.has(branchId)) {
      throw new ApiError(403, "One or more branches are not assigned to this user");
    }
  }
};

const resolveActiveBranchId = (internalBranches, selectedBranchIds) => {
  const selectedSet = new Set(selectedBranchIds);
  const defaultBranch =
    internalBranches.find(
      (branch) => branch.isDefault && selectedSet.has(branch.id),
    ) ??
    internalBranches.find((branch) => selectedSet.has(branch.id)) ??
    null;

  return defaultBranch?.id ?? selectedBranchIds[0] ?? null;
};

const mapSelectedBranches = async (selectedBranchIds) => {
  const branches = await branchService.getBranchesByIds(selectedBranchIds);

  return branches.map(({ id, name }) => ({ id, name }));
};

const enrichProfileWithSelection = async (profile, selectedBranchIds) => {
  const selectedBranches = await mapSelectedBranches(selectedBranchIds);

  return {
    ...profile,
    selectedBranches,
  };
};

export const loadUserAuthProfile = async (userId, preloadedBranches = null) => {
  const [rows] = await pool.execute(
    `SELECT
       u.id,
       u.username,
       u.full_name,
       u.is_active,
       u.role_id,
       r.name AS role_name
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.id = ?`,
    [userId],
  );

  if (!rows.length) {
    return null;
  }

  const row = rows[0];
  const permissions = row.role_id
    ? await roleService.getPermissionNamesForRole(row.role_id)
    : [];

  const branches =
    preloadedBranches ??
    (await userBranchService.getBranchesForUser(userId));

  return {
    id: Number(row.id),
    username: row.username,
    fullName: row.full_name ?? row.username,
    isActive: Boolean(row.is_active),
    branches: userBranchService.mapBranchesForResponse(branches),
    role: mapRole(row),
    permissions,
  };
};

const buildTokenUser = (profile, defaultBranchId, selectedBranchIds) => ({
  id: profile.id,
  username: profile.username,
  name: profile.fullName,
  roleId: profile.role?.id ?? null,
  roleName: profile.role?.name ?? null,
  branchId: defaultBranchId,
  branchIds: profile.branches.map((branch) => branch.id),
  selectedBranchIds,
  permissions: profile.permissions,
});

const issueAuthSession = async ({
  internalBranches,
  profile,
  selectedBranchIds,
  activeBranchId = null,
}) => {
  const defaultBranchId =
    activeBranchId ?? resolveActiveBranchId(internalBranches, selectedBranchIds);
  const user = await enrichProfileWithSelection(profile, selectedBranchIds);

  return {
    token: createAccessToken(
      buildTokenUser(profile, defaultBranchId, selectedBranchIds),
    ),
    user,
    permissions: profile.permissions,
  };
};

export const login = async ({ username, password, branchIds }) => {
  const normalizedUsername = String(username ?? "").trim();
  const plainPassword = String(password ?? "");

  if (!normalizedUsername || !plainPassword) {
    throw new ApiError(400, "Username and password are required");
  }

  const [rows] = await pool.execute(
    `SELECT id, username, password, is_active
     FROM users
     WHERE username = ?`,
    [normalizedUsername],
  );

  if (!rows.length) {
    throw new ApiError(401, "Invalid username or password");
  }

  const dbUser = rows[0];

  if (!dbUser.is_active) {
    throw new ApiError(403, "User account is inactive");
  }

  const passwordMatch = await verifyPassword(plainPassword, dbUser.password);

  if (!passwordMatch) {
    throw new ApiError(401, "Invalid username or password");
  }

  const internalBranches = await userBranchService.getBranchesForUser(dbUser.id);
  const profile = await loadUserAuthProfile(dbUser.id, internalBranches);

  if (!profile) {
    throw new ApiError(401, "Invalid username or password");
  }

  if (!profile.role) {
    throw new ApiError(403, "User role is not assigned");
  }

  if (profile.branches.length === 0) {
    throw new ApiError(403, "User branch is not assigned");
  }

  const mappedBranchIds = profile.branches.map((branch) => branch.id);
  const requestedSelection = parseBranchIdsInput(branchIds);
  const selectedBranchIds = requestedSelection ?? mappedBranchIds;

  validateSelectedBranchIds(selectedBranchIds, mappedBranchIds);

  await pool.execute(`UPDATE users SET last_login_at = NOW() WHERE id = ?`, [
    dbUser.id,
  ]);

  return issueAuthSession({
    internalBranches,
    profile,
    selectedBranchIds,
  });
};

export const selectBranches = async (userId, branchIds) => {
  const selectedBranchIds = parseBranchIdsInput(branchIds);
  const internalBranches = await userBranchService.getBranchesForUser(userId);
  const profile = await loadUserAuthProfile(userId, internalBranches);

  if (!profile) {
    throw new ApiError(404, "User not found");
  }

  const mappedBranchIds = profile.branches.map((branch) => branch.id);
  validateSelectedBranchIds(selectedBranchIds, mappedBranchIds);

  return issueAuthSession({
    internalBranches,
    profile,
    selectedBranchIds,
  });
};

export const switchBranch = async (
  userId,
  branchId,
  { selectedBranchIds: currentSelection = [] } = {},
) => {
  const parsedBranchId = Number.parseInt(String(branchId), 10);

  if (!Number.isInteger(parsedBranchId) || parsedBranchId < 1) {
    throw new ApiError(400, "branchId must be a positive integer");
  }

  const internalBranches = await userBranchService.getBranchesForUser(userId);
  const profile = await loadUserAuthProfile(userId, internalBranches);

  if (!profile) {
    throw new ApiError(404, "User not found");
  }

  const mappedBranchIds = profile.branches.map((branch) => branch.id);

  if (!mappedBranchIds.includes(parsedBranchId)) {
    throw new ApiError(403, "Branch is not assigned to this user");
  }

  const sessionSelection =
    currentSelection.length > 0
      ? currentSelection.filter((id) => mappedBranchIds.includes(id))
      : mappedBranchIds;

  if (!sessionSelection.includes(parsedBranchId)) {
    throw new ApiError(403, "Branch is not in the current session selection");
  }

  await userBranchService.switchUserDefaultBranch(userId, parsedBranchId);

  return issueAuthSession({
    internalBranches,
    profile,
    selectedBranchIds: sessionSelection,
    activeBranchId: parsedBranchId,
  });
};

export const buildProfileResponse = async (userId, selectedBranchIds = []) => {
  const profile = await loadUserAuthProfile(userId);

  if (!profile) {
    return null;
  }

  const resolvedSelection =
    selectedBranchIds.length > 0
      ? selectedBranchIds
      : profile.branches.map((branch) => branch.id);

  return enrichProfileWithSelection(profile, resolvedSelection);
};

export default {
  login,
  loadUserAuthProfile,
  selectBranches,
  switchBranch,
  buildProfileResponse,
};
