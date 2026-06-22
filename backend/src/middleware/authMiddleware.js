import ApiError from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/token.js';

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

  req.user = {
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
    selectedBranchIds: Array.isArray(user.selectedBranchIds)
      ? user.selectedBranchIds.map((id) => Number(id)).filter((id) => id > 0)
      : [],
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
  };
  next();
};
