import pool from "../config/database.js";
import { hashPassword } from "../utils/passwordHasher.js";
import ApiError from "../utils/ApiError.js";

const USER_SELECT_SQL = `
  SELECT
    u.id,
    u.username,
    u.full_name,
    u.is_active,
    u.created_at,
    u.role_id,
    r.name AS role_name,
    u.branch_id,
    b.name AS branch_name
  FROM users u
  LEFT JOIN roles r ON r.id = u.role_id
  LEFT JOIN branches b ON b.id = u.branch_id
`;

const toSafeUser = (row) => ({
  id: Number(row.id),
  username: row.username,
  fullName: row.full_name ?? null,
  isActive: Boolean(row.is_active),
  createdAt: row.created_at,
  role: row.role_id
    ? {
        id: Number(row.role_id),
        name: row.role_name,
      }
    : null,
  branch: row.branch_id
    ? {
        id: Number(row.branch_id),
        name: row.branch_name,
      }
    : null,
});

export const getAllUsers = async () => {
  const [rows] = await pool.execute(
    `${USER_SELECT_SQL}
     ORDER BY u.id ASC`,
  );

  return rows.map(toSafeUser);
};

export const getUserById = async (id) => {
  const [rows] = await pool.execute(`${USER_SELECT_SQL} WHERE u.id = ?`, [id]);
  return rows.length ? toSafeUser(rows[0]) : null;
};

const parseOptionalId = (value, fieldName) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError(400, `${fieldName} must be a positive integer`);
  }

  return parsed;
};

export const createUser = async ({
  username,
  password,
  fullName = null,
  roleId = null,
  branchId = null,
  isActive = true,
}) => {
  const [existing] = await pool.execute(
    "SELECT id FROM users WHERE username = ?",
    [username],
  );

  if (existing.length > 0) {
    throw new ApiError(409, "Username already exists");
  }

  const hashedPassword = await hashPassword(password);
  const parsedRoleId = parseOptionalId(roleId, "roleId");
  const parsedBranchId = parseOptionalId(branchId, "branchId");

  try {
    const [result] = await pool.execute(
      `INSERT INTO users
        (username, password, full_name, role_id, branch_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        username,
        hashedPassword,
        fullName?.trim() || null,
        parsedRoleId,
        parsedBranchId,
        isActive ? 1 : 0,
      ],
    );

    return getUserById(result.insertId);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new ApiError(409, "Username already exists");
    }

    throw error;
  }
};

export const updateUser = async (id, fields) => {
  const setClauses = [];
  const params = [];

  if (fields.username !== undefined) {
    setClauses.push("username = ?");
    params.push(fields.username);
  }

  if (fields.password !== undefined) {
    const hashedPassword = await hashPassword(fields.password);
    setClauses.push("password = ?");
    params.push(hashedPassword);
  }

  if (fields.fullName !== undefined) {
    setClauses.push("full_name = ?");
    params.push(fields.fullName?.trim() || null);
  }

  if (fields.roleId !== undefined) {
    setClauses.push("role_id = ?");
    params.push(parseOptionalId(fields.roleId, "roleId"));
  }

  if (fields.branchId !== undefined) {
    setClauses.push("branch_id = ?");
    params.push(parseOptionalId(fields.branchId, "branchId"));
  }

  if (fields.isActive !== undefined) {
    setClauses.push("is_active = ?");
    params.push(fields.isActive ? 1 : 0);
  }

  if (setClauses.length === 0) {
    throw new ApiError(400, "No fields provided to update");
  }

  params.push(id);

  try {
    const [result] = await pool.execute(
      `UPDATE users SET ${setClauses.join(", ")} WHERE id = ?`,
      params,
    );

    if (result.affectedRows === 0) {
      throw new ApiError(404, "User not found");
    }
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new ApiError(409, "Username already exists");
    }

    throw error;
  }

  return getUserById(id);
};

export const deleteUser = async (id) => {
  const [result] = await pool.execute("DELETE FROM users WHERE id = ?", [id]);

  if (result.affectedRows === 0) {
    throw new ApiError(404, "User not found");
  }
};
