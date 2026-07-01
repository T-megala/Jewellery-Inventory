import ApiError from '../utils/ApiError.js';
import * as userService from '../services/userService.js';

const MAX_USERNAME_LENGTH = 100;
const MAX_PASSWORD_BYTES = 72;

const normalizeUsername = (value) => String(value ?? '').trim();

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
  const username = normalizeUsername(req.body?.username);
  const { password, role } = req.body ?? {};

  if (!username) throw new ApiError(400, 'Username is required');
  if (username.length > MAX_USERNAME_LENGTH) {
    throw new ApiError(400, `Username must be at most ${MAX_USERNAME_LENGTH} characters`);
  }
  if (!password) throw new ApiError(400, 'Password is required');
  if (password.length < 6) throw new ApiError(400, 'Password must be at least 6 characters');
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new ApiError(400, 'Password is too long (max 72 bytes)');
  }

  const user = await userService.createUser(username, password, role);
  res.status(201).json({ success: true, data: user });
};

// PUT /api/v1/users/:id
export const updateUser = async (req, res) => {
  const id = parseId(req.params.id);
  const rawUsername = req.body?.username;
  const { password, role } = req.body ?? {};

  const hasUsername = rawUsername !== undefined && rawUsername !== '';
  const hasPassword = password !== undefined && password !== '';
  const hasRole = role !== undefined && role !== '';

  if (!hasUsername && !hasPassword && !hasRole) {
    throw new ApiError(400, 'At least one of username, password, or role must be provided');
  }

  const fields = {};

  if (hasUsername) {
    const username = normalizeUsername(rawUsername);

    if (!username) {
      throw new ApiError(400, 'Username is required');
    }

    if (username.length > MAX_USERNAME_LENGTH) {
      throw new ApiError(400, `Username must be at most ${MAX_USERNAME_LENGTH} characters`);
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

  if (hasRole) {
    fields.role = role;
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
