import ApiError from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/token.js';

const mapTokenUser = (user) => ({
  id: Number(user.sub),
  sub: user.sub,
  username: user.username,
  name: user.name,
  roleId: user.roleId ?? null,
  roleName: user.roleName ?? null,
  branchId: user.branchId ?? null,
  branchIds: Array.isArray(user.branchIds)
    ? user.branchIds.map((id) => Number(id)).filter((id) => id > 0)
    : [],
  permissions: Array.isArray(user.permissions) ? user.permissions : [],
});

export const optionalAuthenticateApi = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next();
  }

  const user = verifyAccessToken(token);

  if (user) {
    req.user = mapTokenUser(user);
  }

  next();
};

export const authenticateApi = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Authentication token is required'));
  }

  const user = verifyAccessToken(token);

  if (!user) {
    return next(new ApiError(401, 'Invalid or expired authentication token'));
  }

  req.user = mapTokenUser(user);
  next();
};
