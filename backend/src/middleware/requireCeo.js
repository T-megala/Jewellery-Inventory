import ApiError from "../utils/ApiError.js";
import { isCeoRole } from "../constants/roles.js";

export const requireCeo = (req, res, next) => {
  const role = req.user?.role;

  if (!isCeoRole(role)) {
    return next(new ApiError(403, "CEO access required"));
  }

  return next();
};
