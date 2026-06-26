import ApiError from "./ApiError.js";
import { SUPER_ADMIN_ROLE_NAME } from "../services/roleService.js";

export const isSuperAdminRequester = (req) =>
  req?.user?.roleName === SUPER_ADMIN_ROLE_NAME;

export const isSuperAdminRoleName = (roleName) =>
  roleName === SUPER_ADMIN_ROLE_NAME;

export const denySuperAdminAccessUnlessRequester = (
  req,
  { message = "Not found", statusCode = 404 } = {},
) => {
  if (!isSuperAdminRequester(req)) {
    throw new ApiError(statusCode, message);
  }
};
