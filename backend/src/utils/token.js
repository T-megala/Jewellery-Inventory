import crypto from 'crypto';

const DEFAULT_EXPIRY = '15h';

const base64UrlEncode = (value) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

const base64UrlDecode = (value) =>
  JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

const parseExpirySeconds = (value = DEFAULT_EXPIRY) => {
  const match = String(value).trim().match(/^(\d+)([smhd])?$/i);

  if (!match) {
    return 15 * 60 * 60;
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = (match[2] || 's').toLowerCase();
  const multipliers = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  };

  return amount * multipliers[unit];
};

export const parseTokenExpirySeconds = (value, fallbackSeconds = null) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallbackSeconds ?? parseExpirySeconds(DEFAULT_EXPIRY);
  }

  const match = String(value).trim().match(/^(\d+)([smhd])?$/i);
  if (!match) {
    return fallbackSeconds ?? parseExpirySeconds(DEFAULT_EXPIRY);
  }

  return parseExpirySeconds(value);
};

const getSecret = () => {
  const secret = process.env.ACCESS_TOKEN_SECRET;

  if (!secret || !secret.trim()) {
    throw new Error('ACCESS_TOKEN_SECRET is required');
  }

  return secret.trim();
};

const sign = (payload) =>
  crypto
    .createHmac('sha256', getSecret())
    .update(payload)
    .digest('base64url');

export const createAccessToken = (user) => {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = parseTokenExpirySeconds(process.env.ACCESS_TOKEN_EXPIRY);
  const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
  const payload = base64UrlEncode({
    sub: String(user.id),
    username: user.username,
    name: user.name,
    roleId: user.roleId ?? null,
    roleName: user.roleName ?? null,
    branchId: user.branchId ?? null,
    branchIds: Array.isArray(user.branchIds)
      ? user.branchIds.map((id) => Number(id)).filter((id) => id > 0)
      : [],
    selectedBranchIds: Array.isArray(user.selectedBranchIds)
      ? user.selectedBranchIds.map((id) => Number(id)).filter((id) => id > 0)
      : [],
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    iat: now,
    exp: now + expiresIn,
  });
  const signature = sign(`${header}.${payload}`);

  return `${header}.${payload}.${signature}`;
};

export const verifyAccessToken = (token) => {
  try {
    const parts = String(token || '').split('.');

    if (parts.length !== 3) {
      return null;
    }

    const [header, payload, signature] = parts;
    const expectedSignature = sign(`${header}.${payload}`);
    const actual = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);

    if (
      actual.length !== expected.length ||
      !crypto.timingSafeEqual(actual, expected)
    ) {
      return null;
    }

    const decoded = base64UrlDecode(payload);
    const now = Math.floor(Date.now() / 1000);

    if (!decoded.exp || decoded.exp < now) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
};
