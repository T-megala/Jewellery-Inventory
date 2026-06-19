import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";
import { createAccessToken } from "../utils/token.js";
import { verifyPassword } from "../utils/passwordHasher.js";
import roleService from "./roleService.js";
import userBranchService from "./userBranchService.js";

const mapRole = (row) =>
  row?.role_id
    ? {
        id: Number(row.role_id),
        name: row.role_name,
      }
    : null;

export const loadUserAuthProfile = async (userId) => {
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

  const branches = await userBranchService.getBranchesForUser(userId);
  const defaultBranch =
    branches.find((branch) => branch.isDefault) ?? branches[0] ?? null;

  return {
    id: Number(row.id),
    username: row.username,
    fullName: row.full_name ?? row.username,
    isActive: Boolean(row.is_active),
    branch: defaultBranch
      ? {
          id: defaultBranch.id,
          name: defaultBranch.name,
          isMain: defaultBranch.isMain,
          isActive: defaultBranch.isActive,
        }
      : null,
    branches: branches.map(({ id, name, isMain, isActive, isDefault }) => ({
      id,
      name,
      isMain,
      isActive,
      isDefault,
    })),
    role: mapRole(row),
    permissions,
  };
};

const buildTokenUser = (profile) => ({
  id: profile.id,
  username: profile.username,
  name: profile.fullName,
  roleId: profile.role?.id ?? null,
  roleName: profile.role?.name ?? null,
  branchId: profile.branch?.id ?? null,
  branchIds: profile.branches.map((branch) => branch.id),
  permissions: profile.permissions,
});

export const login = async ({ username, password }) => {
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

  const profile = await loadUserAuthProfile(dbUser.id);

  if (!profile) {
    throw new ApiError(401, "Invalid username or password");
  }

  if (!profile.role) {
    throw new ApiError(403, "User role is not assigned");
  }

  if (profile.branches.length === 0) {
    throw new ApiError(403, "User branch is not assigned");
  }

  const inactiveAssignedBranch = profile.branches.find(
    (branch) => !branch.isActive,
  );

  if (profile.branches.length > 0 && profile.branches.every((b) => !b.isActive)) {
    throw new ApiError(403, "All assigned branches are inactive");
  }

  if (profile.branch && !profile.branch.isActive && inactiveAssignedBranch) {
    throw new ApiError(403, "Default branch is inactive");
  }

  await pool.execute(`UPDATE users SET last_login_at = NOW() WHERE id = ?`, [
    dbUser.id,
  ]);

  return {
    token: createAccessToken(buildTokenUser(profile)),
    user: profile,
    permissions: profile.permissions,
  };
};

export const switchBranch = async (userId, branchId) => {
  await userBranchService.switchUserDefaultBranch(userId, branchId);
  const profile = await loadUserAuthProfile(userId);

  if (!profile) {
    throw new ApiError(404, "User not found");
  }

  return {
    token: createAccessToken(buildTokenUser(profile)),
    user: profile,
    permissions: profile.permissions,
  };
};

export default {
  login,
  loadUserAuthProfile,
  switchBranch,
};
