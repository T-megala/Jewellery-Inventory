import ApiError from "../utils/ApiError.js";
import roleService from "../services/roleService.js";
import {
  denySuperAdminAccessUnlessRequester,
  isSuperAdminRequester,
  isSuperAdminRoleName,
} from "../utils/superAdminScope.js";

const parseId = (raw) => {
  const id = Number.parseInt(String(raw), 10);

  if (!Number.isInteger(id) || id < 1) {
    throw new ApiError(400, "id must be a positive integer");
  }

  return id;
};

const parsePermissionIds = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new ApiError(400, "permissionIds must be an array");
  }

  return value.map((permissionId) => parseId(permissionId));
};

export const listPermissions = async (_req, res) => {
  const permissions = await roleService.getAllPermissions();
  res.status(200).json({ success: true, data: permissions });
};

export const listRoles = async (req, res) => {
  const includeInactive = String(req.query?.includeInactive ?? "") === "true";
  const roles = await roleService.getAllRoles({
    includeInactive,
    excludeSuperAdmin: !isSuperAdminRequester(req),
  });
  res.status(200).json({ success: true, data: roles });
};

export const getRole = async (req, res) => {
  const role = await roleService.getRoleById(parseId(req.params.id));

  if (!role) {
    throw new ApiError(404, "Role not found");
  }

  if (isSuperAdminRoleName(role.name)) {
    denySuperAdminAccessUnlessRequester(req, { message: "Role not found" });
  }

  res.status(200).json({ success: true, data: role });
};

export const createRole = async (req, res) => {
  const role = await roleService.createRole({
    name: req.body?.name,
    description: req.body?.description,
    permissionIds: parsePermissionIds(req.body?.permissionIds) ?? [],
  });

  res.status(201).json({ success: true, data: role });
};

export const updateRole = async (req, res) => {
  const roleId = parseId(req.params.id);
  const existingRole = await roleService.getRoleById(roleId);

  if (!existingRole) {
    throw new ApiError(404, "Role not found");
  }

  if (isSuperAdminRoleName(existingRole.name)) {
    denySuperAdminAccessUnlessRequester(req, { message: "Role not found" });
  }

  const role = await roleService.updateRole(roleId, {
    name: req.body?.name,
    description: req.body?.description,
    isActive: req.body?.isActive,
    permissionIds: parsePermissionIds(req.body?.permissionIds),
  });

  res.status(200).json({ success: true, data: role });
};

export const deleteRole = async (req, res) => {
  const roleId = parseId(req.params.id);
  const existingRole = await roleService.getRoleById(roleId);

  if (!existingRole) {
    throw new ApiError(404, "Role not found");
  }

  if (isSuperAdminRoleName(existingRole.name)) {
    denySuperAdminAccessUnlessRequester(req, { message: "Role not found" });
  }

  await roleService.deleteRole(roleId);
  res.status(200).json({ success: true, message: "Role deleted successfully" });
};
