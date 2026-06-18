import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";

const toRole = (row) => ({
  id: Number(row.id),
  name: row.name,
  description: row.description ?? null,
  isSystem: Boolean(row.is_system),
  isActive: Boolean(row.is_active),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toPermission = (row) => ({
  id: Number(row.id),
  name: row.name,
  module: row.module,
  action: row.action,
  description: row.description ?? null,
});

export const getAllPermissions = async () => {
  const [rows] = await pool.execute(
    `SELECT id, name, module, action, description
     FROM permissions
     ORDER BY module ASC, action ASC, name ASC`,
  );

  return rows.map(toPermission);
};

export const getRolePermissions = async (roleId) => {
  const [rows] = await pool.execute(
    `SELECT p.id, p.name, p.module, p.action, p.description
     FROM permissions p
     INNER JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = ?
     ORDER BY p.module ASC, p.action ASC`,
    [roleId],
  );

  return rows.map(toPermission);
};

export const getPermissionNamesForRole = async (roleId) => {
  const permissions = await getRolePermissions(roleId);
  return permissions.map((permission) => permission.name);
};

export const getAllRoles = async ({ includeInactive = false } = {}) => {
  const whereClause = includeInactive ? "1 = 1" : "is_active = 1";

  const [rows] = await pool.execute(
    `SELECT id, name, description, is_system, is_active, created_at, updated_at
     FROM roles
     WHERE ${whereClause}
     ORDER BY name ASC`,
  );

  const roles = [];

  for (const row of rows) {
    const permissions = await getRolePermissions(row.id);
    roles.push({
      ...toRole(row),
      permissions,
    });
  }

  return roles;
};

export const getRoleById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT id, name, description, is_system, is_active, created_at, updated_at
     FROM roles
     WHERE id = ?`,
    [id],
  );

  if (!rows.length) {
    return null;
  }

  const permissions = await getRolePermissions(id);

  return {
    ...toRole(rows[0]),
    permissions,
  };
};

const replaceRolePermissions = async (connection, roleId, permissionIds) => {
  await connection.execute(`DELETE FROM role_permissions WHERE role_id = ?`, [
    roleId,
  ]);

  if (!permissionIds.length) {
    return;
  }

  const placeholders = permissionIds.map(() => "(?, ?)").join(", ");
  const values = permissionIds.flatMap((permissionId) => [roleId, permissionId]);

  await connection.execute(
    `INSERT INTO role_permissions (role_id, permission_id) VALUES ${placeholders}`,
    values,
  );
};

export const createRole = async ({ name, description, permissionIds = [] }) => {
  const roleName = String(name ?? "").trim();

  if (!roleName) {
    throw new ApiError(400, "Role name is required");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.execute(
      `INSERT INTO roles (name, description, is_system, is_active)
       VALUES (?, ?, 0, 1)`,
      [roleName, description?.trim() || null],
    );

    const roleId = result.insertId;

    if (permissionIds.length) {
      await replaceRolePermissions(connection, roleId, permissionIds);
    }

    await connection.commit();
    return getRoleById(roleId);
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      throw new ApiError(409, "Role name already exists");
    }

    throw error;
  } finally {
    connection.release();
  }
};

export const updateRole = async (
  id,
  { name, description, isActive, permissionIds },
) => {
  const existing = await getRoleById(id);

  if (!existing) {
    throw new ApiError(404, "Role not found");
  }

  if (existing.isSystem && isActive === false) {
    throw new ApiError(400, "System roles cannot be deactivated");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      `UPDATE roles
       SET name = ?,
           description = ?,
           is_active = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name !== undefined ? String(name).trim() : existing.name,
        description !== undefined ? description?.trim() || null : existing.description,
        isActive !== undefined ? (isActive ? 1 : 0) : existing.isActive ? 1 : 0,
        id,
      ],
    );

    if (permissionIds !== undefined) {
      await replaceRolePermissions(connection, id, permissionIds);
    }

    await connection.commit();
    return getRoleById(id);
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      throw new ApiError(409, "Role name already exists");
    }

    throw error;
  } finally {
    connection.release();
  }
};

export const deleteRole = async (id) => {
  const role = await getRoleById(id);

  if (!role) {
    throw new ApiError(404, "Role not found");
  }

  if (role.isSystem) {
    throw new ApiError(400, "System roles cannot be deleted");
  }

  const [users] = await pool.execute(
    `SELECT COUNT(*) AS total FROM users WHERE role_id = ?`,
    [id],
  );

  if (Number(users[0]?.total ?? 0) > 0) {
    throw new ApiError(400, "Cannot delete role while users are assigned to it");
  }

  await pool.execute(`DELETE FROM roles WHERE id = ?`, [id]);
};

export default {
  getAllPermissions,
  getAllRoles,
  getRoleById,
  getPermissionNamesForRole,
  createRole,
  updateRole,
  deleteRole,
};
