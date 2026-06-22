import { apiFetch } from './api.js';

function normalizeBranchIds(branchIds) {
  if (branchIds === undefined) return undefined;

  return [
    ...new Set(
      branchIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}

function normalizeUser(user) {
  return {
    id: Number(user.id),
    username: user.username,
    fullName: user.fullName ?? null,
    createdAt: user.created_at ?? user.createdAt ?? null,
    role: user.role ?? null,
    branch: user.branch ?? null,
    branches: (user.branches || []).map((branch) => ({
      id: Number(branch.id),
      name: branch.name,
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
      roleId: Number(roleId),
      branchIds: normalizeBranchIds(branchIds),
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
    body.roleId = Number(roleId);
  }

  const normalizedBranchIds = normalizeBranchIds(branchIds);
  if (normalizedBranchIds !== undefined) {
    body.branchIds = normalizedBranchIds;
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
