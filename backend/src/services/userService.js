import pool from '../config/database.js';
import { hashPassword } from '../utils/passwordHasher.js';
import ApiError from '../utils/ApiError.js';

/** Strip the password field before returning a user to callers. */
const toSafeUser = ({ id, username, created_at }) => ({ id, username, created_at });

/** Get all users ordered by id ascending. */
export const getAllUsers = async () => {
  const [rows] = await pool.execute(
    'SELECT id, username, created_at FROM users ORDER BY id ASC',
  );
  return rows.map(toSafeUser);
};

/** Get a single user by id. Returns null if not found. */
export const getUserById = async (id) => {
  const [rows] = await pool.execute(
    'SELECT id, username, created_at FROM users WHERE id = ?',
    [id],
  );
  return rows.length ? toSafeUser(rows[0]) : null;
};

/** Create a new user. Throws 409 if username is taken. */
export const createUser = async (username, plainPassword) => {
  // Explicit duplicate check before hashing (gives a clear 409 before any DB write)
  const [existing] = await pool.execute(
    'SELECT id FROM users WHERE username = ?',
    [username],
  );
  if (existing.length > 0) {
    throw new ApiError(409, 'Username already exists');
  }

  const hashedPassword = await hashPassword(plainPassword);

  try {
    const [result] = await pool.execute(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username, hashedPassword],
    );
    const [rows] = await pool.execute(
      'SELECT id, username, created_at FROM users WHERE id = ?',
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

/** Update a user's username and/or password. Throws 404 or 409 as appropriate. */
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
    'SELECT id, username, created_at FROM users WHERE id = ?',
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
