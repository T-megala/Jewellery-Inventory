import ApiError from '../utils/ApiError.js';
import * as userService from '../services/userService.js';

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{1,50}$/;
const MAX_PASSWORD_BYTES = 72;

/** Validate that :id is a positive integer. */
const parseId = (raw) => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new ApiError(400, 'id must be a positive integer');
  }
  return n;
};

// GET /api/v1/users
export const listUsers = async (_req, res) => {
  const users = await userService.getAllUsers();
  res.status(200).json({ success: true, data: users });
};

// GET /api/v1/users/:id
export const getUser = async (req, res) => {
  const id = parseId(req.params.id);
  const user = await userService.getUserById(id);
  if (!user) throw new ApiError(404, 'User not found');
  res.status(200).json({ success: true, data: user });
};

// POST /api/v1/users
export const createUser = async (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username) throw new ApiError(400, 'Username is required');
  if (!USERNAME_REGEX.test(username)) {
    throw new ApiError(400, 'Username must be 1–50 characters and contain only letters, numbers, underscores, or hyphens');
  }
  if (!password) throw new ApiError(400, 'Password is required');
  if (password.length < 6) throw new ApiError(400, 'Password must be at least 6 characters');
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new ApiError(400, 'Password is too long (max 72 bytes)');
  }

  const user = await userService.createUser(username, password);
  res.status(201).json({ success: true, data: user });
};

// PUT /api/v1/users/:id
export const updateUser = async (req, res) => {
  const id = parseId(req.params.id);
  const { username, password } = req.body ?? {};

  const hasUsername = username !== undefined && username !== '';
  const hasPassword = password !== undefined && password !== '';

  if (!hasUsername && !hasPassword) {
    throw new ApiError(400, 'At least one of username or password must be provided');
  }

  const fields = {};

  if (hasUsername) {
    if (!USERNAME_REGEX.test(username)) {
      throw new ApiError(400, 'Username must be 1–50 characters and contain only letters, numbers, underscores, or hyphens');
    }
    fields.username = username;
  }

  if (hasPassword) {
    if (password.length < 6) throw new ApiError(400, 'Password must be at least 6 characters');
    if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
      throw new ApiError(400, 'Password is too long (max 72 bytes)');
    }
    fields.password = password;
  }

  const user = await userService.updateUser(id, fields);
  res.status(200).json({ success: true, data: user });
};

// DELETE /api/v1/users/:id
export const deleteUser = async (req, res) => {
  const id = parseId(req.params.id);

  // Prevent self-deletion
  if (req.user && req.user.id === id) {
    throw new ApiError(403, 'You cannot delete your own account');
  }

  await userService.deleteUser(id);
  res.status(200).json({ success: true, message: 'User deleted successfully' });
};
