import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";
import { createAccessToken } from "../utils/token.js";
import { verifyPassword } from "../utils/passwordHasher.js";
import roleService from "./roleService.js";

const mapBranch = (row) =>
  row
    ? {
        id: Number(row.branch_id ?? row.id),
        name: row.branch_name ?? row.name,
        isMain: Boolean(row.is_main),
        isActive: Boolean(row.is_active),
      }
    : null;

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
       u.branch_id,
       b.name AS branch_name,
       b.is_main,
       b.is_active AS branch_is_active,
       u.role_id,
       r.name AS role_name
     FROM users u
     LEFT JOIN branches b ON b.id = u.branch_id
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

  return {
    id: Number(row.id),
    username: row.username,
    fullName: row.full_name ?? row.username,
    isActive: Boolean(row.is_active),
    branch: row.branch_id
      ? {
          id: Number(row.branch_id),
          name: row.branch_name,
          isMain: Boolean(row.is_main),
          isActive: Boolean(row.branch_is_active),
        }
      : null,
    role: mapRole(row),
    permissions,
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

  const profile = await loadUserAuthProfile(dbUser.id);

  if (!profile) {
    throw new ApiError(401, "Invalid username or password");
  }

  if (profile.branch && !profile.branch.isActive) {
    throw new ApiError(403, "Assigned branch is inactive");
  }

  await pool.execute(
    `UPDATE users SET last_login_at = NOW() WHERE id = ?`,
    [dbUser.id],
  );

  const tokenUser = {
    id: profile.id,
    username: profile.username,
    name: profile.fullName,
    roleId: profile.role?.id ?? null,
    roleName: profile.role?.name ?? null,
    branchId: profile.branch?.id ?? null,
    permissions: profile.permissions,
  };

  return {
    token: createAccessToken(tokenUser),
    user: profile,
    permissions: profile.permissions,
  };
};

export default {
  login,
  loadUserAuthProfile,
};
