import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";
import { createAccessToken } from "../utils/token.js";
import { verifyPassword } from "../utils/passwordHasher.js";
import roleService from "./roleService.js";
import userBranchService from "./userBranchService.js";
import userLogService from "./userLogService.js";

const mapRole = (row) =>
  row?.role_id
    ? {
        id: Number(row.role_id),
        name: row.role_name,
      }
    : null;

const resolveDefaultBranchId = (internalBranches) => {
  const defaultBranch =
    internalBranches.find((branch) => branch.isDefault) ??
    internalBranches[0] ??
    null;

  return defaultBranch?.id ?? null;
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
    preloadedBranches ?? (await userBranchService.getBranchesForUser(userId));

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

const buildTokenUser = (profile, defaultBranchId) => ({
  id: profile.id,
  username: profile.username,
  name: profile.fullName,
  roleId: profile.role?.id ?? null,
  roleName: profile.role?.name ?? null,
  branchId: defaultBranchId,
  branchIds: profile.branches.map((branch) => branch.id),
  permissions: profile.permissions,
});

const issueAuthSession = async ({
  internalBranches,
  profile,
  rotateRefreshSessionId = null,
}) => {
  const defaultBranchId = resolveDefaultBranchId(internalBranches);

  if (rotateRefreshSessionId) {
    await userLogService.revokeSession(rotateRefreshSessionId);
  }

  const refreshToken = await userLogService.createRefreshSession(profile.id);

  return {
    token: createAccessToken(buildTokenUser(profile, defaultBranchId)),
    refreshToken,
    user: profile,
    permissions: profile.permissions,
  };
};

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

  const internalBranches = await userBranchService.getBranchesForUser(
    dbUser.id,
  );
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

  await pool.execute(`UPDATE users SET last_login_at = NOW() WHERE id = ?`, [
    dbUser.id,
  ]);

  return issueAuthSession({
    internalBranches,
    profile,
  });
};

export const refreshAccessToken = async ({ refreshToken }) => {
  const plainRefreshToken = String(refreshToken ?? "").trim();

  if (!plainRefreshToken) {
    throw new ApiError(400, "refreshToken is required");
  }

  const session = await userLogService.findValidSession(plainRefreshToken);

  if (!session) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const internalBranches = await userBranchService.getBranchesForUser(
    session.userId,
  );
  const profile = await loadUserAuthProfile(session.userId, internalBranches);

  if (!profile || !profile.isActive) {
    await userLogService.revokeSession(session.id);
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  if (!profile.role) {
    await userLogService.revokeSession(session.id);
    throw new ApiError(403, "User role is not assigned");
  }

  if (profile.branches.length === 0) {
    await userLogService.revokeSession(session.id);
    throw new ApiError(403, "User branch is not assigned");
  }

  await userLogService.touchSession(session.id);

  return issueAuthSession({
    internalBranches,
    profile,
    rotateRefreshSessionId: session.id,
  });
};

export const buildProfileResponse = async (userId) => {
  return loadUserAuthProfile(userId);
};

export default {
  login,
  refreshAccessToken,
  loadUserAuthProfile,
  buildProfileResponse,
};
