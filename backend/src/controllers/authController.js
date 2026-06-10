import ApiError from '../utils/ApiError.js';
import { createAccessToken } from '../utils/token.js';
import { verifyPassword } from '../utils/passwordHasher.js';
import pool from '../config/database.js';

export const login = async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (!username || !password) {
    throw new ApiError(400, 'Username and password are required');
  }

  // Look up user in the database
  const [rows] = await pool.execute(
    'SELECT id, username, password FROM users WHERE username = ?',
    [username],
  );

  if (rows.length === 0) {
    throw new ApiError(401, 'Invalid username or password');
  }

  const dbUser = rows[0];

  const passwordMatch = await verifyPassword(password, dbUser.password);
  if (!passwordMatch) {
    throw new ApiError(401, 'Invalid username or password');
  }

  const user = {
    id: dbUser.id,
    name: dbUser.username,
    username: dbUser.username,
    role: 'user',
  };

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: {
      token: createAccessToken(user),
      user,
    },
  });
};
