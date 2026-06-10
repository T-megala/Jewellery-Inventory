import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;
const MAX_PASSWORD_BYTES = 72;

/**
 * Hashes a plain-text password using bcrypt.
 * Throws if the password exceeds 72 bytes (bcrypt silent-truncation limit).
 */
export const hashPassword = async (plainText) => {
  const byteLength = Buffer.byteLength(plainText, 'utf8');
  if (byteLength > MAX_PASSWORD_BYTES) {
    throw new Error('Password exceeds the maximum allowed length of 72 bytes');
  }
  return bcrypt.hash(plainText, SALT_ROUNDS);
};

/**
 * Verifies a plain-text password against a bcrypt hash.
 */
export const verifyPassword = async (plainText, hash) => {
  return bcrypt.compare(plainText, hash);
};
