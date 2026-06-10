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

  req.user = user;
  next();
};
