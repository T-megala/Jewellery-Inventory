import { apiFetch } from './api.js';

function normalizePermission(permission) {
  return {
    id: permission.id,
    name: permission.name,
    module: permission.module,
    action: permission.action,
    description: permission.description ?? '',
  };
}

function normalizeRole(role) {
  return {
    id: role.id,
    name: role.name,
    description: role.description ?? '',
    isSystem: Boolean(role.isSystem),
    isActive: role.isActive !== false,
    permissions: (role.permissions || []).map(normalizePermission),
    createdAt: role.created_at ?? role.createdAt ?? null,
    updatedAt: role.updated_at ?? role.updatedAt ?? null,
  };
}

export async function fetchPermissions() {
  const data = await apiFetch('/permissions');
  return (data || []).map(normalizePermission);
}

export async function fetchRoles({ includeInactive = true } = {}) {
  const query = includeInactive ? '?includeInactive=true' : '';
  const data = await apiFetch(`/roles${query}`);
  return (data || []).map(normalizeRole);
}

export function createRole(payload) {
  return apiFetch('/roles', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then(normalizeRole);
}

export function updateRole(id, payload) {
  return apiFetch(`/roles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }).then(normalizeRole);
}

export async function deleteRole(id) {
  await apiFetch(`/roles/${id}`, {
    method: 'DELETE',
  });
}
