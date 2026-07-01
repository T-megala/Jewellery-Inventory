import pool from '../config/database.js';
import { hashPassword } from '../utils/passwordHasher.js';
import ApiError from '../utils/ApiError.js';
import { USER_ROLES } from '../constants/roles.js';

const ALLOWED_ROLES = new Set(Object.values(USER_ROLES));

const normalizeRole = (role) => {
  const value = String(role ?? USER_ROLES.USER).trim().toLowerCase();
  return ALLOWED_ROLES.has(value) ? value : USER_ROLES.USER;
};

/** Strip the password field before returning a user to callers. */
const toSafeUser = ({ id, username, role, created_at }) => ({
  id,
  username,
  role: role ?? USER_ROLES.USER,
  created_at,
});

/** Get all users ordered by id ascending. */
export const getAllUsers = async () => {
  const [rows] = await pool.execute(
    'SELECT id, username, role, created_at FROM users ORDER BY id ASC',
  );
  return rows.map(toSafeUser);
};

/** Get a single user by id. Returns null if not found. */
export const getUserById = async (id) => {
  const [rows] = await pool.execute(
    'SELECT id, username, role, created_at FROM users WHERE id = ?',
    [id],
  );
  return rows.length ? toSafeUser(rows[0]) : null;
};

/** Create a new user. Throws 409 if username is taken. */
export const createUser = async (username, plainPassword, role = USER_ROLES.USER) => {
  const [existing] = await pool.execute(
    'SELECT id FROM users WHERE username = ?',
    [username],
  );
  if (existing.length > 0) {
    throw new ApiError(409, 'Username already exists');
  }

  const hashedPassword = await hashPassword(plainPassword);
  const normalizedRole = normalizeRole(role);

  try {
    const [result] = await pool.execute(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      [username, hashedPassword, normalizedRole],
    );
    const [rows] = await pool.execute(
      'SELECT id, username, role, created_at FROM users WHERE id = ?',
      [result.insertId],
    );
    return toSafeUser(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new ApiError(409, 'Username already exists');
    }
    throw err;
  }
};

/** Update a user's username, password, and/or role. */
export const updateUser = async (id, fields) => {
  const setClauses = [];
  const params = [];

  if (fields.username !== undefined) {
    setClauses.push('username = ?');
    params.push(fields.username);
  }

  if (fields.password !== undefined) {
    const hashedPassword = await hashPassword(fields.password);
    setClauses.push('password = ?');
    params.push(hashedPassword);
  }

  if (fields.role !== undefined) {
    setClauses.push('role = ?');
    params.push(normalizeRole(fields.role));
  }

  if (setClauses.length === 0) {
    throw new ApiError(400, 'No fields to update');
  }

  params.push(id);

  try {
    const [result] = await pool.execute(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`,
      params,
    );

    if (result.affectedRows === 0) {
      throw new ApiError(404, 'User not found');
    }
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new ApiError(409, 'Username already exists');
    }
    throw err;
  }

  const [rows] = await pool.execute(
    'SELECT id, username, role, created_at FROM users WHERE id = ?',
    [id],
  );
  return toSafeUser(rows[0]);
};

/** Delete a user by id. Throws 404 if not found. */
export const deleteUser = async (id) => {
  const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [id]);
  if (result.affectedRows === 0) {
    throw new ApiError(404, 'User not found');
  }
};
