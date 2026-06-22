import { apiFetch } from './api.js';

function normalizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName ?? null,
    createdAt: user.created_at ?? user.createdAt ?? null,
    role: user.role ?? null,
    branch: user.branch ?? null,
    branches: (user.branches || []).map((branch) => ({
      id: branch.id,
      name: branch.name,
      isDefault: Boolean(branch.isDefault),
    })),
  };
}

export async function fetchUsers() {
  const data = await apiFetch('/users');
  return (data || []).map(normalizeUser);
}

export function createUser({ username, password, roleId, branchIds }) {
  return apiFetch('/users', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
      roleId,
      branchIds,
    }),
  }).then(normalizeUser);
}

export function updateUser(id, { username, password, roleId, branchIds }) {
  const body = {};

  if (username !== undefined) {
    body.username = username;
  }

  if (password) {
    body.password = password;
  }

  if (roleId !== undefined) {
    body.roleId = roleId;
  }

  if (branchIds !== undefined) {
    body.branchIds = branchIds;
  }

  return apiFetch(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  }).then(normalizeUser);
}

export async function deleteUser(id) {
  await apiFetch(`/users/${id}`, {
    method: 'DELETE',
  });
}
