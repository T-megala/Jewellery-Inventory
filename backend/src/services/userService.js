import pool from "../config/database.js";
import { hashPassword } from "../utils/passwordHasher.js";
import ApiError from "../utils/ApiError.js";
import userBranchService from "./userBranchService.js";
import branchService from "./branchService.js";
import roleService, { SUPER_ADMIN_ROLE_NAME } from "./roleService.js";

const USER_SELECT_SQL = `
  SELECT
    u.id,
    u.username,
    u.full_name,
    u.is_active,
    u.created_at,
    u.role_id,
    r.name AS role_name
  FROM users u
  LEFT JOIN roles r ON r.id = u.role_id
`;

const parseRequiredId = (value, fieldName) => {
  const parsed = parseOptionalId(value, fieldName);

  if (!parsed) {
    throw new ApiError(400, `${fieldName} is required`);
  }

  return parsed;
};

const assertBranchAssignment = (branchAssignment) => {
  if (!branchAssignment || branchAssignment.branchIds.length === 0) {
    throw new ApiError(400, "At least one branch is required");
  }
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

const parseBranchIds = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new ApiError(400, "branchIds must be an array");
  }

  return [
    ...new Set(
      value
        .map((id) => Number.parseInt(String(id), 10))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
};

const resolveBranchAssignment = ({ branchId, branchIds, defaultBranchId }) => {
  const parsedBranchIds = parseBranchIds(branchIds);

  if (parsedBranchIds !== undefined) {
    return {
      branchIds: parsedBranchIds,
      defaultBranchId:
        defaultBranchId !== undefined
          ? parseOptionalId(defaultBranchId, "defaultBranchId")
          : branchId !== undefined
            ? parseOptionalId(branchId, "branchId")
            : null,
    };
  }

  if (branchId !== undefined && branchId !== null && branchId !== "") {
    const parsedBranchId = parseOptionalId(branchId, "branchId");

    return {
      branchIds: parsedBranchId ? [parsedBranchId] : [],
      defaultBranchId: parsedBranchId,
    };
  }

  return null;
};

const buildSuperAdminBranchAssignment = async ({
  branchId,
  branchIds,
  defaultBranchId,
}) => {
  const allBranches = await branchService.getAllBranches();

  if (allBranches.length === 0) {
    throw new ApiError(400, "No branches available to assign");
  }

  const allBranchIds = allBranches.map((branch) => branch.id);
  const explicitDefault =
    defaultBranchId !== undefined && defaultBranchId !== null && defaultBranchId !== ""
      ? parseOptionalId(defaultBranchId, "defaultBranchId")
      : branchId !== undefined && branchId !== null && branchId !== ""
        ? parseOptionalId(branchId, "branchId")
        : null;

  const resolvedDefault =
    explicitDefault && allBranchIds.includes(explicitDefault)
      ? explicitDefault
      : allBranchIds[0];

  return {
    branchIds: allBranchIds,
    defaultBranchId: resolvedDefault,
  };
};

const resolveCreateBranchAssignment = async ({
  roleId,
  branchId,
  branchIds,
  defaultBranchId,
}) => {
  const role = await roleService.getRoleById(roleId);

  if (role?.name === SUPER_ADMIN_ROLE_NAME) {
    return buildSuperAdminBranchAssignment({
      branchId,
      branchIds,
      defaultBranchId,
    });
  }

  const branchAssignment = resolveBranchAssignment({
    branchId,
    branchIds,
    defaultBranchId,
  });

  assertBranchAssignment(branchAssignment);
  return branchAssignment;
};

const toSafeUser = async (row) => {
  const branches = await userBranchService.getBranchesForUser(row.id);
  const defaultBranch =
    branches.find((branch) => branch.isDefault) ?? branches[0] ?? null;

  return {
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
    branch: defaultBranch
      ? {
          id: defaultBranch.id,
          name: defaultBranch.name,
        }
      : null,
    branches: branches.map(({ id, name, isDefault }) => ({
      id,
      name,
      isDefault,
    })),
  };
};

export const getAllUsers = async () => {
  const [rows] = await pool.execute(
    `${USER_SELECT_SQL}
     ORDER BY u.id ASC`,
  );

  return Promise.all(rows.map((row) => toSafeUser(row)));
};

export const getUserById = async (id) => {
  const [rows] = await pool.execute(`${USER_SELECT_SQL} WHERE u.id = ?`, [id]);
  return rows.length ? toSafeUser(rows[0]) : null;
};

export const createUser = async ({
  username,
  password,
  fullName = null,
  roleId = null,
  branchId = null,
  branchIds,
  defaultBranchId = null,
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
  const parsedRoleId = parseRequiredId(roleId, "roleId");
  const branchAssignment = await resolveCreateBranchAssignment({
    roleId: parsedRoleId,
    branchId,
    branchIds,
    defaultBranchId,
  });

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.execute(
      `INSERT INTO users
        (username, password, full_name, role_id, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [
        username,
        hashedPassword,
        fullName?.trim() || null,
        parsedRoleId,
        isActive ? 1 : 0,
      ],
    );

    const userId = result.insertId;

    if (branchAssignment) {
      await userBranchService.setUserBranches(
        userId,
        branchAssignment.branchIds,
        branchAssignment.defaultBranchId,
        connection,
      );
    }

    await connection.commit();
    return getUserById(userId);
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      throw new ApiError(409, "Username already exists");
    }

    throw error;
  } finally {
    connection.release();
  }
};

export const updateUser = async (id, fields) => {
  let branchAssignment = resolveBranchAssignment({
    branchId: fields.branchId,
    branchIds: fields.branchIds,
    defaultBranchId: fields.defaultBranchId,
  });

  if (fields.roleId !== undefined) {
    const parsedRoleId = parseRequiredId(fields.roleId, "roleId");
    const role = await roleService.getRoleById(parsedRoleId);

    if (role?.name === SUPER_ADMIN_ROLE_NAME) {
      branchAssignment = await buildSuperAdminBranchAssignment({
        branchId: fields.branchId,
        branchIds: fields.branchIds,
        defaultBranchId: fields.defaultBranchId,
      });
    }
  }

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
    params.push(parseRequiredId(fields.roleId, "roleId"));
  }

  if (fields.isActive !== undefined) {
    setClauses.push("is_active = ?");
    params.push(fields.isActive ? 1 : 0);
  }

  if (setClauses.length === 0 && !branchAssignment) {
    throw new ApiError(400, "No fields provided to update");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (setClauses.length > 0) {
      params.push(id);

      const [result] = await connection.execute(
        `UPDATE users SET ${setClauses.join(", ")} WHERE id = ?`,
        params,
      );

      if (result.affectedRows === 0) {
        throw new ApiError(404, "User not found");
      }
    } else {
      const [existing] = await connection.execute(
        `SELECT id FROM users WHERE id = ?`,
        [id],
      );

      if (!existing.length) {
        throw new ApiError(404, "User not found");
      }
    }

    if (branchAssignment) {
      assertBranchAssignment(branchAssignment);

      await userBranchService.setUserBranches(
        id,
        branchAssignment.branchIds,
        branchAssignment.defaultBranchId,
        connection,
      );
    }

    await connection.commit();
    return getUserById(id);
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      throw new ApiError(409, "Username already exists");
    }

    throw error;
  } finally {
    connection.release();
  }
};

export const deleteUser = async (id) => {
  const [result] = await pool.execute("DELETE FROM users WHERE id = ?", [id]);

  if (result.affectedRows === 0) {
    throw new ApiError(404, "User not found");
  }
};
