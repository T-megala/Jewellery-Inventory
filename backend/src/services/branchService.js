import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";

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

  try {
    const [result] = await pool.execute(
      `INSERT INTO branches (name, address, city, phone)
       VALUES (?, ?, ?, ?)`,
      [
        name,
        payload.address?.trim() || null,
        payload.city?.trim() || null,
        payload.phone?.trim() || null,
      ],
    );

    return getBranchById(result.insertId);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new ApiError(409, "Branch name already exists");
    }

    throw error;
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
  const [users] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM user_branches
     WHERE branch_id = ?`,
    [id],
  );

  if (Number(users[0]?.total ?? 0) > 0) {
    throw new ApiError(
      400,
      "Cannot delete branch while users are assigned to it",
    );
  }

  const [result] = await pool.execute(`DELETE FROM branches WHERE id = ?`, [id]);

  if (result.affectedRows === 0) {
    throw new ApiError(404, "Branch not found");
  }
};

export default {
  getDefaultBranchId,
  getAllBranches,
  getBranchById,
  createBranch,
  updateBranch,
  deleteBranch,
};
