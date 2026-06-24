import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";
import userBranchService from "./userBranchService.js";

const toBranch = (row) => ({
  id: Number(row.id),
  name: row.name,
  address: row.address ?? null,
  city: row.city ?? null,
  phone: row.phone ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getDefaultBranchId = async () => {
  const [rows] = await pool.execute(
    `SELECT id FROM branches ORDER BY id ASC LIMIT 1`,
  );

  return rows[0]?.id ?? null;
};

export const getAllBranches = async () => {
  const [rows] = await pool.execute(
    `SELECT id, name, address, city, phone, created_at, updated_at
     FROM branches
     ORDER BY name ASC`,
  );

  return rows.map(toBranch);
};

export const getBranchesByIds = async (branchIds = []) => {
  const uniqueIds = [
    ...new Set(
      branchIds
        .map((id) => Number.parseInt(String(id), 10))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];

  if (uniqueIds.length === 0) {
    return [];
  }

  const placeholders = uniqueIds.map(() => "?").join(", ");
  const [rows] = await pool.execute(
    `SELECT id, name, address, city, phone, created_at, updated_at
     FROM branches
     WHERE id IN (${placeholders})
     ORDER BY name ASC`,
    uniqueIds,
  );

  return rows.map(toBranch);
};

export const getBranchById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT id, name, address, city, phone, created_at, updated_at
     FROM branches
     WHERE id = ?`,
    [id],
  );

  return rows.length ? toBranch(rows[0]) : null;
};

export const createBranch = async (payload) => {
  const name = String(payload.name ?? "").trim();

  if (!name) {
    throw new ApiError(400, "Branch name is required");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.execute(
      `INSERT INTO branches (name, address, city, phone)
       VALUES (?, ?, ?, ?)`,
      [
        name,
        payload.address?.trim() || null,
        payload.city?.trim() || null,
        payload.phone?.trim() || null,
      ],
    );

    const branchId = result.insertId;
    await userBranchService.assignBranchToSuperAdminUsers(branchId, connection);
    await connection.commit();

    return getBranchById(branchId);
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      throw new ApiError(409, "Branch name already exists");
    }

    throw error;
  } finally {
    connection.release();
  }
};

export const updateBranch = async (id, payload) => {
  const existing = await getBranchById(id);

  if (!existing) {
    throw new ApiError(404, "Branch not found");
  }

  const name =
    payload.name !== undefined ? String(payload.name).trim() : existing.name;

  if (!name) {
    throw new ApiError(400, "Branch name is required");
  }

  try {
    await pool.execute(
      `UPDATE branches
       SET name = ?,
           address = ?,
           city = ?,
           phone = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name,
        payload.address !== undefined
          ? payload.address?.trim() || null
          : existing.address,
        payload.city !== undefined ? payload.city?.trim() || null : existing.city,
        payload.phone !== undefined
          ? payload.phone?.trim() || null
          : existing.phone,
        id,
      ],
    );

    return getBranchById(id);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new ApiError(409, "Branch name already exists");
    }

    throw error;
  }
};

export const deleteBranch = async (id) => {
  const [result] = await pool.execute(`DELETE FROM branches WHERE id = ?`, [id]);

  if (result.affectedRows === 0) {
    throw new ApiError(404, "Branch not found");
  }
};

export default {
  getDefaultBranchId,
  getAllBranches,
  getBranchesByIds,
  getBranchById,
  createBranch,
  updateBranch,
  deleteBranch,
};
