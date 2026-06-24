import crypto from "crypto";
import pool from "../config/database.js";
import { parseTokenExpirySeconds } from "../utils/token.js";

const hashRefreshToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

const generateRefreshToken = () => crypto.randomBytes(48).toString("base64url");

const getRefreshExpiryDate = () => {
  const seconds = parseTokenExpirySeconds(
    process.env.REFRESH_TOKEN_EXPIRY,
    7 * 24 * 60 * 60,
  );

  return new Date(Date.now() + seconds * 1000);
};

const parseSelectedBranchIds = (value) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((id) => Number(id)).filter((id) => id > 0);
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((id) => Number(id)).filter((id) => id > 0)
      : [];
  } catch {
    return [];
  }
};

const mapSessionRow = (row) => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  selectedBranchIds: parseSelectedBranchIds(row.selected_branch_ids),
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
});

export const createRefreshSession = async (userId, selectedBranchIds = []) => {
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const expiresAt = getRefreshExpiryDate();
  const branchIdsJson = JSON.stringify(
    selectedBranchIds.map((id) => Number(id)).filter((id) => id > 0),
  );

  await pool.execute(
    `INSERT INTO user_logs (user_id, refresh_token_hash, selected_branch_ids, expires_at)
     VALUES (?, ?, ?, ?)`,
    [userId, refreshTokenHash, branchIdsJson, expiresAt],
  );

  return refreshToken;
};

export const findValidSession = async (refreshToken) => {
  const refreshTokenHash = hashRefreshToken(refreshToken);

  const [rows] = await pool.execute(
    `SELECT id, user_id, selected_branch_ids, expires_at, revoked_at, created_at, last_used_at
     FROM user_logs
     WHERE refresh_token_hash = ?
       AND revoked_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [refreshTokenHash],
  );

  if (!rows.length) {
    return null;
  }

  return mapSessionRow(rows[0]);
};

export const touchSession = async (sessionId) => {
  await pool.execute(
    `UPDATE user_logs SET last_used_at = NOW() WHERE id = ?`,
    [sessionId],
  );
};

export const revokeSession = async (sessionId) => {
  await pool.execute(
    `UPDATE user_logs
     SET revoked_at = NOW()
     WHERE id = ? AND revoked_at IS NULL`,
    [sessionId],
  );
};

export const revokeSessionsForUser = async (userId) => {
  await pool.execute(
    `UPDATE user_logs
     SET revoked_at = NOW()
     WHERE user_id = ? AND revoked_at IS NULL`,
    [userId],
  );
};

export default {
  createRefreshSession,
  findValidSession,
  touchSession,
  revokeSession,
  revokeSessionsForUser,
};
