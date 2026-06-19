import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";

const mapBranchRow = (row) => ({
  id: Number(row.branch_id),
  name: row.branch_name,
  isDefault: Boolean(row.is_default),
});

export const getBranchesForUser = async (userId, connection = pool) => {
  const [rows] = await connection.execute(
    `SELECT
       ub.branch_id,
       ub.is_default,
       b.name AS branch_name
     FROM user_branches ub
     INNER JOIN branches b ON b.id = ub.branch_id
     WHERE ub.user_id = ?
     ORDER BY ub.is_default DESC, b.name ASC`,
    [userId],
  );

  return rows.map(mapBranchRow);
};

export const getDefaultBranchForUser = async (userId) => {
  const branches = await getBranchesForUser(userId);
  return branches.find((branch) => branch.isDefault) ?? branches[0] ?? null;
};

export const getBranchIdsForUser = async (userId) => {
  const branches = await getBranchesForUser(userId);
  return branches.map((branch) => branch.id);
};

const validateBranchIds = async (connection, branchIds) => {
  if (!branchIds.length) {
    return;
  }

  const placeholders = branchIds.map(() => "?").join(", ");
  const [rows] = await connection.execute(
    `SELECT id FROM branches WHERE id IN (${placeholders})`,
    branchIds,
  );

  if (rows.length !== branchIds.length) {
    throw new ApiError(400, "One or more branch IDs are invalid");
  }
};

const applyUserBranches = async (
  connection,
  userId,
  uniqueBranchIds,
  resolvedDefault,
) => {
  await connection.execute(`DELETE FROM user_branches WHERE user_id = ?`, [
    userId,
  ]);

  if (uniqueBranchIds.length === 0) {
    return [];
  }

  const placeholders = uniqueBranchIds.map(() => "(?, ?, ?)").join(", ");
  const values = uniqueBranchIds.flatMap((branchId) => [
    userId,
    branchId,
    branchId === resolvedDefault ? 1 : 0,
  ]);

  await connection.execute(
    `INSERT INTO user_branches (user_id, branch_id, is_default)
     VALUES ${placeholders}`,
    values,
  );

  return getBranchesForUser(userId, connection);
};

export const setUserBranches = async (
  userId,
  branchIds,
  defaultBranchId = null,
  externalConnection = null,
) => {
  const uniqueBranchIds = [
    ...new Set(
      branchIds
        .map((id) => Number.parseInt(String(id), 10))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];

  const run = async (connection) => {
    if (uniqueBranchIds.length === 0) {
      return applyUserBranches(connection, userId, [], null);
    }

    await validateBranchIds(connection, uniqueBranchIds);

    const resolvedDefault =
      defaultBranchId && uniqueBranchIds.includes(Number(defaultBranchId))
        ? Number(defaultBranchId)
        : uniqueBranchIds[0];

    return applyUserBranches(
      connection,
      userId,
      uniqueBranchIds,
      resolvedDefault,
    );
  };

  if (externalConnection) {
    return run(externalConnection);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const branches = await run(connection);
    await connection.commit();
    return branches;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const userHasBranchAccess = async (userId, branchId) => {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM user_branches
     WHERE user_id = ? AND branch_id = ?
     LIMIT 1`,
    [userId, branchId],
  );

  return rows.length > 0;
};

export const switchUserDefaultBranch = async (userId, branchId) => {
  const parsedBranchId = Number.parseInt(String(branchId), 10);

  if (!Number.isInteger(parsedBranchId) || parsedBranchId < 1) {
    throw new ApiError(400, "branchId must be a positive integer");
  }

  const hasAccess = await userHasBranchAccess(userId, parsedBranchId);

  if (!hasAccess) {
    throw new ApiError(403, "Branch is not assigned to this user");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      `UPDATE user_branches SET is_default = 0 WHERE user_id = ?`,
      [userId],
    );

    await connection.execute(
      `UPDATE user_branches
       SET is_default = 1
       WHERE user_id = ? AND branch_id = ?`,
      [userId, parsedBranchId],
    );

    await connection.commit();

    return getDefaultBranchForUser(userId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export default {
  getBranchesForUser,
  getDefaultBranchForUser,
  getBranchIdsForUser,
  setUserBranches,
  userHasBranchAccess,
  switchUserDefaultBranch,
};
